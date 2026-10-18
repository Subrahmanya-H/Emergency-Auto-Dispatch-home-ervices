const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { createHmac, randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { Pool } = require('pg');
const multer = require('multer');
const { findNearestEligibleTechnician } = require('./dispatch');
const {
	toRazorpayPaise,
	verifyRazorpaySignature,
	verifyRazorpayWebhookSignature
} = require('./payments');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const scryptAsync = promisify(scrypt);
const sessionCookieName = 'emergency_auto_session';
const sessionLifetimeSeconds = 12 * 60 * 60;
const uploadsDirectory = path.join(__dirname, 'uploads');
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const revokedSessions = new Map();
const pool = process.env.DATABASE_URL
	? new Pool({ connectionString: process.env.DATABASE_URL })
	: null;
const imageTypes = Object.freeze({
	'image/jpeg': { extension: '.jpg', contentType: 'image/jpeg' },
	'image/png': { extension: '.png', contentType: 'image/png' },
	'image/webp': { extension: '.webp', contentType: 'image/webp' }
});
const serviceImageUpload = multer({
	storage: multer.diskStorage({
		destination: uploadsDirectory,
		filename: (request, file, callback) => {
			callback(null, `${randomBytes(16).toString('hex')}${imageTypes[file.mimetype].extension}`);
		}
	}),
	limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 4096, parts: 6 },
	fileFilter: (request, file, callback) => {
		if (!Object.hasOwn(imageTypes, file.mimetype)) {
			callback(new Error('Upload a JPEG, PNG, or WebP image.'));
			return;
		}
		callback(null, true);
	}
}).single('image');
const technicianProfileImageUpload = multer({
	storage: multer.diskStorage({
		destination: uploadsDirectory,
		filename: (request, file, callback) => {
			callback(null, `${randomBytes(16).toString('hex')}${imageTypes[file.mimetype].extension}`);
		}
	}),
	limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, fieldSize: 4096, parts: 9 },
	fileFilter: (request, file, callback) => {
		if (!Object.hasOwn(imageTypes, file.mimetype)) {
			callback(new Error('Upload a JPEG, PNG, or WebP image.'));
			return;
		}
		callback(null, true);
	}
}).single('profileImage');
const roles = Object.freeze({
	user: { databaseRole: 'customer', profileTable: 'customers' },
	technician: { databaseRole: 'technician', profileTable: 'technicians' },
	admin: { databaseRole: 'admin', profileTable: 'admins' }
});
const staticFiles = Object.freeze({
	'/': ['emergency_auto_dispatch.html', 'text/html; charset=utf-8'],
	'/emergency_auto_dispatch.html': ['emergency_auto_dispatch.html', 'text/html; charset=utf-8'],
	'/emg_auto_dispatch.css': ['emg_auto_dispatch.css', 'text/css; charset=utf-8'],
	'/emg_auto_dispatch.js': ['emg_auto_dispatch.js', 'text/javascript; charset=utf-8'],
	'/workers-background.png': ['workers-background.png', 'image/png']
});

function sendJson(response, statusCode, payload) {
	response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(payload));
}

class PaymentGatewayError extends Error {
	constructor(message) {
		super(message);
		this.name = 'PaymentGatewayError';
	}
}

class PayloadTooLargeError extends Error {
	constructor() {
		super('Webhook request body is too large.');
		this.name = 'PayloadTooLargeError';
	}
}

function getRazorpayCredentials() {
	const keyId = process.env.RAZORPAY_KEY_ID?.trim();
	const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
	return keyId && keySecret ? { keyId, keySecret } : null;
}

async function razorpayRequest(pathname, method, body, credentials) {
	let response;
	try {
		response = await fetch(`https://api.razorpay.com/v1${pathname}`, {
			method,
			headers: {
				Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
				...(body ? { 'Content-Type': 'application/json' } : {})
			},
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(15000)
		});
	} catch {
		throw new PaymentGatewayError('Could not reach Razorpay. Please try again.');
	}
	let result;
	try {
		result = await response.json();
	} catch {
		throw new PaymentGatewayError('Razorpay returned an invalid response. Please try again.');
	}
	if (!response.ok) {
		throw new PaymentGatewayError(result?.error?.description || 'Razorpay could not process this payment request.');
	}
	return result;
}

async function readRawRequestBody(request, maxBytes = 16384) {
	const chunks = [];
	let length = 0;
	for await (const chunk of request) {
		length += chunk.length;
		if (length > maxBytes) throw new PayloadTooLargeError();
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, length);
}

async function handleRazorpayWebhook(request, response) {
	const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
	if (!webhookSecret) {
		sendJson(response, 503, { message: 'Razorpay webhook is not configured on the server.' });
		return;
	}
	if (!pool) {
		sendJson(response, 503, { message: 'Database is not configured. Set DATABASE_URL and restart the server.' });
		return;
	}
	const signature = request.headers['x-razorpay-signature'];
	if (typeof signature !== 'string') {
		sendJson(response, 400, { message: 'Razorpay webhook signature is required.' });
		return;
	}
	const rawBody = await readRawRequestBody(request);
	if (!verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
		sendJson(response, 400, { message: 'Razorpay webhook signature is invalid.' });
		return;
	}
	let event;
	try {
		event = JSON.parse(rawBody.toString('utf8'));
	} catch {
		sendJson(response, 400, { message: 'Razorpay webhook body is invalid.' });
		return;
	}
	if (event.event !== 'payment.captured') {
		sendJson(response, 200, { received: true });
		return;
	}

	const payment = event.payload?.payment?.entity;
	if (!payment || typeof payment.id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(payment.id)
		|| typeof payment.order_id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(payment.order_id)
		|| payment.status !== 'captured' || payment.captured !== true
		|| payment.currency !== 'INR' || !Number.isSafeInteger(payment.amount)) {
		sendJson(response, 400, { message: 'Razorpay webhook does not contain a valid captured payment.' });
		return;
	}
	const result = await pool.query(
		`UPDATE public.jobs
		 SET payment_status = 'paid', razorpay_payment_id = $1,
			payment_paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		 WHERE razorpay_order_id = $2 AND payment_amount_paise = $3
			AND status = 'completed' AND payment_status <> 'paid'
		 RETURNING id`,
		[payment.id, payment.order_id, payment.amount]
	);
	if (!result.rows[0]) {
		const existing = await pool.query(
			`SELECT payment_status AS "paymentStatus",
				razorpay_payment_id AS "razorpayPaymentId"
			 FROM public.jobs WHERE razorpay_order_id = $1`,
			[payment.order_id]
		);
		if (existing.rows[0]?.paymentStatus !== 'paid'
			|| existing.rows[0]?.razorpayPaymentId !== payment.id) {
			console.error('Razorpay captured payment webhook did not match a pending completed job.');
		}
	}
	sendJson(response, 200, { received: true });
}

function createSessionToken(user) {
	pruneRevokedSessions();
	const payload = Buffer.from(JSON.stringify({
		id: user.id,
		username: user.username,
		role: user.role,
		sessionId: randomBytes(16).toString('hex'),
		expiresAt: Date.now() + sessionLifetimeSeconds * 1000
	})).toString('base64url');
	const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
	return `${payload}.${signature}`;
}

function pruneRevokedSessions() {
	const now = Date.now();
	for (const [sessionId, expiresAt] of revokedSessions) {
		if (expiresAt <= now) revokedSessions.delete(sessionId);
	}
}

function getSession(request) {
	const cookie = request.headers.cookie
		?.split(';')
		.map(value => value.trim())
		.find(value => value.startsWith(`${sessionCookieName}=`));
	if (!cookie) return null;

	const token = cookie.slice(sessionCookieName.length + 1);
	const [payload, signature] = token.split('.');
	if (!payload || !signature) return null;
	const expectedSignature = createHmac('sha256', sessionSecret).update(payload).digest();
	let providedSignature;
	try {
		providedSignature = Buffer.from(signature, 'base64url');
	} catch {
		return null;
	}
	if (providedSignature.length !== expectedSignature.length
		|| !timingSafeEqual(providedSignature, expectedSignature)) return null;

	try {
		const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		if (!Number.isInteger(user.id)
			|| typeof user.username !== 'string'
			|| typeof user.role !== 'string'
			|| !Object.hasOwn(roles, user.role)
			|| typeof user.sessionId !== 'string'
			|| !/^[a-f0-9]{32}$/.test(user.sessionId)
			|| !Number.isFinite(user.expiresAt)
			|| user.expiresAt <= Date.now()
			|| revokedSessions.has(user.sessionId)) return null;
		return user;
	} catch {
		return null;
	}
}

function setSessionCookie(response, token) {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	response.setHeader(
		'Set-Cookie',
		`${sessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetimeSeconds}${secure}`
	);
}

function clearSessionCookie(response) {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	response.setHeader(
		'Set-Cookie',
		`${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
	);
}

async function readJson(request) {
	let rawBody = '';
	for await (const chunk of request) {
		rawBody += chunk;
		if (rawBody.length > 16384) throw new Error('Request body is too large.');
	}
	try {
		return JSON.parse(rawBody);
	} catch {
		throw new Error('Invalid JSON request.');
	}
}

async function hashPassword(password) {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = await scryptAsync(password, salt, 64);
	return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
	if (typeof storedHash !== 'string') return false;
	const [salt, keyHex] = storedHash.split(':');
	if (!salt || !keyHex || !/^[a-f0-9]{128}$/i.test(keyHex)) return false;
	const storedKey = Buffer.from(keyHex, 'hex');
	const candidateKey = await scryptAsync(password, salt, storedKey.length);
	return timingSafeEqual(storedKey, candidateKey);
}

async function verifySchema() {
	const requiredTables = ['users', 'customers', 'technicians', 'admins'];
	const result = await pool.query(
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
		[requiredTables]
	);
	const existingTables = new Set(result.rows.map(row => row.table_name));
	const missingTables = requiredTables.filter(tableName => !existingTables.has(tableName));
	if (missingTables.length > 0) {
		throw new Error(`Required database tables are missing: ${missingTables.join(', ')}`);
	}
	const adminColumns = await pool.query(
		`SELECT column_name FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'admins'
		 AND column_name = ANY($1::text[])`,
		[['username', 'password_hash']]
	);
	const existingAdminColumns = new Set(adminColumns.rows.map(row => row.column_name));
	const missingAdminColumns = ['username', 'password_hash']
		.filter(columnName => !existingAdminColumns.has(columnName));
	if (missingAdminColumns.length > 0) {
		throw new Error(`Required admins columns are missing: ${missingAdminColumns.join(', ')}`);
	}

	await pool.query(`
		CREATE TABLE IF NOT EXISTS public.services (
			id SERIAL PRIMARY KEY,
			service_name VARCHAR(100) UNIQUE NOT NULL,
			category VARCHAR(100) NOT NULL,
			description TEXT,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			image_url TEXT
		)
	`);
	await pool.query('ALTER TABLE public.services ADD COLUMN IF NOT EXISTS image_url TEXT');
	await pool.query(`
		CREATE TABLE IF NOT EXISTS public.jobs (
			id SERIAL PRIMARY KEY,
			service_id INTEGER REFERENCES public.services(id) ON DELETE SET NULL,
			service_name VARCHAR(100) NOT NULL,
			customer_name VARCHAR(100) NOT NULL,
			customer_phone VARCHAR(30) NOT NULL,
			address TEXT NOT NULL,
			details TEXT,
			status VARCHAR(20) NOT NULL DEFAULT 'requested'
				CHECK (status IN ('requested', 'assigned', 'in_progress', 'completed', 'cancelled')),
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`);
	await pool.query(`
		ALTER TABLE public.jobs
			ADD COLUMN IF NOT EXISTS completion_report TEXT,
			ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
			ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_due',
			ADD COLUMN IF NOT EXISTS payment_amount_paise BIGINT,
			ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100),
			ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100),
			ADD COLUMN IF NOT EXISTS payment_paid_at TIMESTAMPTZ
	`);
	await pool.query(`
		CREATE UNIQUE INDEX IF NOT EXISTS jobs_razorpay_order_id_unique
			ON public.jobs (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL
	`);
	await pool.query(`
		CREATE UNIQUE INDEX IF NOT EXISTS jobs_razorpay_payment_id_unique
			ON public.jobs (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL
	`);
	await pool.query(`
		ALTER TABLE public.technicians
			ADD COLUMN IF NOT EXISTS current_latitude DOUBLE PRECISION,
			ADD COLUMN IF NOT EXISTS current_longitude DOUBLE PRECISION,
			ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
			ADD COLUMN IF NOT EXISTS is_sharing_location BOOLEAN NOT NULL DEFAULT FALSE,
			ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT FALSE,
			ADD COLUMN IF NOT EXISTS skill_category VARCHAR(100) NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
			ADD COLUMN IF NOT EXISTS service_area VARCHAR(500),
			ADD COLUMN IF NOT EXISTS service_rate NUMERIC(10, 2),
			ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
			ADD COLUMN IF NOT EXISTS skills TEXT,
			ADD COLUMN IF NOT EXISTS achievements TEXT,
			ADD COLUMN IF NOT EXISTS education TEXT
	`);
	await pool.query(`
		UPDATE public.technicians SET skill_category = '' WHERE skill_category IS NULL;
		ALTER TABLE public.technicians
			ALTER COLUMN skill_category SET DEFAULT '',
			ALTER COLUMN skill_category SET NOT NULL
	`);
	await pool.query(`
		ALTER TABLE public.jobs
			ADD COLUMN IF NOT EXISTS customer_latitude DOUBLE PRECISION,
			ADD COLUMN IF NOT EXISTS customer_longitude DOUBLE PRECISION,
			ADD COLUMN IF NOT EXISTS technician_id INTEGER REFERENCES public.technicians(id) ON DELETE SET NULL
	`);

	const defaultServices = [
		['Fire and Rescue', 'Emergency Response', 'Fire-related emergencies and rescue'],
		['Ambulance and Paramedics', 'Emergency Response', 'Medical emergencies and ambulance assistance'],
		['Electrical Repair', 'Home Repairs', 'Electrical faults and household wiring'],
		['Fan Repair', 'Home Repairs', 'Ceiling fan and other fan repairs'],
		['Plumbing', 'Home Repairs', 'Leaking pipes, taps and plumbing'],
		['HVAC and AC Repair', 'Home Repairs', 'Air conditioning and ventilation repairs'],
		['Refrigerator Repair', 'Appliance Repair', 'Refrigerator troubleshooting and repair'],
		['Washing Machine Repair', 'Appliance Repair', 'Washing machine troubleshooting and repair'],
		['Mixer Grinder Repair', 'Appliance Repair', 'Mixer and grinder troubleshooting and repair'],
		['Bicycle Repair', 'Vehicle and Bicycle Repair', 'Bicycle punctures, brakes and maintenance'],
		['Car Mechanic', 'Vehicle and Bicycle Repair', 'Car breakdowns and mechanical repairs'],
		['Motorcycle Repair', 'Vehicle and Bicycle Repair', 'Motorcycle maintenance and breakdown assistance'],
		['Home Cooking', 'Home Assistance', 'Hire a cook for meal preparation'],
		['Home Cleaning', 'Home Assistance', 'Home cleaning and housekeeping'],
		['Food Delivery', 'Home Assistance', 'Delivery of prepared food'],
		['Household Helper', 'Home Assistance', 'Help with everyday household tasks'],
		['Home Barber', 'Personal Care', 'Haircuts and grooming at home'],
		['Home Makeup Artist', 'Personal Care', 'Makeup services at home'],
		['Home Salon Services', 'Personal Care', 'Personal grooming and beauty services']
	];
	await pool.query(
		`INSERT INTO public.services (service_name, category, description)
		 SELECT seed.service_name, seed.category, seed.description
		 FROM UNNEST($1::text[], $2::text[], $3::text[])
			AS seed(service_name, category, description)
		 ON CONFLICT (service_name) DO NOTHING`,
		[
			defaultServices.map(([name]) => name),
			defaultServices.map(([, category]) => category),
			defaultServices.map(([, , description]) => description)
		]
	);
}

function uploadImage(request, response) {
	return new Promise((resolve, reject) => {
		serviceImageUpload(request, response, error => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function removeUploadedImage(filePath) {
	if (!filePath) return;
	await fs.unlink(filePath).catch(error => {
		if (error.code !== 'ENOENT') throw error;
	});
}

async function isValidImage(file) {
	if (!file || !Object.hasOwn(imageTypes, file.mimetype)) return false;
	const handle = await fs.open(file.path, 'r');
	try {
		const header = Buffer.alloc(12);
		const { bytesRead } = await handle.read(header, 0, header.length, 0);
		const bytes = header.subarray(0, bytesRead);
		if (file.mimetype === 'image/jpeg') {
			return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
		}
		if (file.mimetype === 'image/png') {
			return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
		}
		return bytes.length >= 12
			&& bytes.toString('ascii', 0, 4) === 'RIFF'
			&& bytes.toString('ascii', 8, 12) === 'WEBP';
	} finally {
		await handle.close();
	}
}

function validateService(body) {
	const serviceName = typeof body.serviceName === 'string' ? body.serviceName.trim() : '';
	const category = typeof body.category === 'string' ? body.category.trim() : '';
	const description = typeof body.description === 'string' ? body.description.trim() : '';
	const activeValue = body.isActive;
	const isActive = activeValue === true || activeValue === 'true';
	if (serviceName.length < 1 || serviceName.length > 100) {
		return { error: 'Service name must be between 1 and 100 characters.' };
	}
	if (category.length < 1 || category.length > 100) {
		return { error: 'Category must be between 1 and 100 characters.' };
	}
	if (description.length > 2000) {
		return { error: 'Description must be 2,000 characters or fewer.' };
	}
	if (activeValue !== true && activeValue !== false && activeValue !== 'true' && activeValue !== 'false') {
		return { error: 'Choose whether this service is active.' };
	}
	return { serviceName, category, description, isActive };
}

function parsePositiveId(value) {
	if (!/^[1-9]\d*$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}

async function autoDispatchJob(client, jobId) {
	const jobResult = await client.query(
		`SELECT j.id, j.status, j.technician_id AS "technicianId",
			j.customer_latitude AS latitude, j.customer_longitude AS longitude,
			s.category
		 FROM public.jobs j
		 LEFT JOIN public.services s ON s.id = j.service_id
		 WHERE j.id = $1
		 FOR UPDATE OF j`,
		[jobId]
	);
	const job = jobResult.rows[0];
	if (!job) throw new Error(`Job ${jobId} was not found during automatic dispatch.`);
	if (job.status !== 'requested' || job.technicianId !== null) {
		return { outcome: 'already_processed', technicianId: job.technicianId };
	}
	if (job.latitude === null || job.longitude === null) {
		return { outcome: 'customer_location_required' };
	}

	const techniciansResult = await client.query(
		`SELECT t.id, t.skill_category AS "skillCategory",
			t.is_available AS "isAvailable",
			t.is_sharing_location AS "isSharingLocation",
			t.current_latitude AS latitude, t.current_longitude AS longitude,
			t.location_updated_at AS "locationUpdatedAt",
			(t.phone IS NOT NULL AND BTRIM(t.phone) <> ''
				AND t.service_area IS NOT NULL AND BTRIM(t.service_area) <> ''
				AND t.service_rate IS NOT NULL AND t.profile_image_url IS NOT NULL) AS "profileComplete",
			EXISTS (
				SELECT 1 FROM public.jobs active_job
				WHERE active_job.technician_id = t.id
					AND active_job.status IN ('assigned', 'in_progress')
			) AS "hasActiveJob",
			u.username AS "technicianName"
		 FROM public.technicians t
		 JOIN public.users u ON u.id = t.user_id
		 ORDER BY t.id
		 FOR UPDATE OF t SKIP LOCKED`,
		[]
	);
	const best = findNearestEligibleTechnician({
		latitude: job.latitude,
		longitude: job.longitude,
		category: job.category
	}, techniciansResult.rows);
	if (!best) return { outcome: 'no_technician_available' };
	const assignmentResult = await client.query(
		`UPDATE public.jobs
		 SET technician_id = $1, status = 'assigned', updated_at = CURRENT_TIMESTAMP
		 WHERE id = $2 AND status = 'requested' AND technician_id IS NULL
		 RETURNING id, technician_id AS "technicianId", status,
			updated_at AS "updatedAt"`,
		[best.id, jobId]
	);
	if (!assignmentResult.rows[0]) {
		throw new Error(`Job ${jobId} could not be assigned during automatic dispatch.`);
	}

	return {
		outcome: 'assigned',
		job: assignmentResult.rows[0],
		technicianName: best.technicianName,
		distanceKm: Number(best.distanceKm.toFixed(2))
	};
}

async function handleCustomerRequest(request, response, requestUrl) {
	if (!pool) {
		sendJson(response, 503, { message: 'Database is not configured. Set DATABASE_URL and restart the server.' });
		return;
	}
	const user = getSession(request);
	if (!user) {
		sendJson(response, 401, { message: 'Sign in to view and request services.' });
		return;
	}
	if (user.role !== 'user') {
		sendJson(response, 403, { message: 'Customer access is required.' });
		return;
	}

	const paymentOrderMatch = requestUrl.pathname.match(/^\/api\/jobs\/([1-9]\d*)\/payment\/order$/);
	if (request.method === 'POST' && paymentOrderMatch) {
		const credentials = getRazorpayCredentials();
		if (!credentials) {
			sendJson(response, 503, { message: 'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.' });
			return;
		}
		const jobId = parsePositiveId(paymentOrderMatch[1]);
		const client = await pool.connect();
		let transactionStarted = false;
		try {
			await client.query('BEGIN');
			transactionStarted = true;
			const result = await client.query(
				`SELECT j.id, j.status, j.payment_status AS "paymentStatus",
					j.payment_amount_paise AS "paymentAmountPaise",
					j.razorpay_order_id AS "razorpayOrderId",
					j.service_name AS "serviceName", j.customer_phone AS "customerPhone",
					t.service_rate AS "serviceRate"
				 FROM public.jobs j
				 JOIN public.technicians t ON t.id = j.technician_id
				 WHERE j.id = $1 AND j.customer_name = $2
				 FOR UPDATE OF j`,
				[jobId, user.username]
			);
			const job = result.rows[0];
			if (!job) {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 404, { message: 'Your assigned service request was not found.' });
				return;
			}
			if (job.status !== 'completed') {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: 'Payment is available after the technician reports the work complete.' });
				return;
			}
			if (job.paymentStatus === 'paid') {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: 'This service request has already been paid.' });
				return;
			}

			let orderId = job.razorpayOrderId;
			let amountPaise;
			try {
				amountPaise = job.paymentAmountPaise === null
					? toRazorpayPaise(job.serviceRate)
					: Number(job.paymentAmountPaise);
			} catch (error) {
				if (!(error instanceof RangeError)) throw error;
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: error.message });
				return;
			}
			if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
				throw new Error('The saved service rate is not a valid payment amount.');
			}
			if (!orderId) {
				const order = await razorpayRequest('/orders', 'POST', {
					amount: amountPaise,
					currency: 'INR',
					receipt: `job_${job.id}_${randomBytes(8).toString('hex')}`,
					notes: { jobId: String(job.id) }
				}, credentials);
				if (typeof order.id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(order.id)
					|| order.amount !== amountPaise || order.currency !== 'INR') {
					throw new PaymentGatewayError('Razorpay returned an invalid order. Please try again.');
				}
				orderId = order.id;
				await client.query(
					`UPDATE public.jobs
					 SET payment_status = 'pending', payment_amount_paise = $1,
						razorpay_order_id = $2, updated_at = CURRENT_TIMESTAMP
					 WHERE id = $3`,
					[amountPaise, orderId, job.id]
				);
			}
			await client.query('COMMIT');
			transactionStarted = false;
			sendJson(response, 200, {
				keyId: credentials.keyId,
				orderId,
				amount: amountPaise,
				currency: 'INR',
				serviceName: job.serviceName,
				customerPhone: job.customerPhone
			});
		} catch (error) {
			if (transactionStarted) await client.query('ROLLBACK');
			if (error instanceof PaymentGatewayError) {
				sendJson(response, 502, { message: error.message });
				return;
			}
			throw error;
		} finally {
			client.release();
		}
		return;
	}

	const paymentVerifyMatch = requestUrl.pathname.match(/^\/api\/jobs\/([1-9]\d*)\/payment\/verify$/);
	if (request.method === 'POST' && paymentVerifyMatch) {
		const credentials = getRazorpayCredentials();
		if (!credentials) {
			sendJson(response, 503, { message: 'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.' });
			return;
		}
		const jobId = parsePositiveId(paymentVerifyMatch[1]);
		const body = await readJson(request);
		if (!body || typeof body !== 'object' || Array.isArray(body)
			|| typeof body.orderId !== 'string'
			|| typeof body.paymentId !== 'string'
			|| typeof body.signature !== 'string') {
			sendJson(response, 400, { message: 'Razorpay did not return valid payment details.' });
			return;
		}
		const client = await pool.connect();
		let transactionStarted = false;
		try {
			await client.query('BEGIN');
			transactionStarted = true;
			const result = await client.query(
				`SELECT j.status, j.payment_status AS "paymentStatus",
					j.payment_amount_paise AS "paymentAmountPaise",
					j.razorpay_order_id AS "razorpayOrderId",
					j.razorpay_payment_id AS "razorpayPaymentId"
				 FROM public.jobs j
				 WHERE j.id = $1 AND j.customer_name = $2
				 FOR UPDATE OF j`,
				[jobId, user.username]
			);
			const job = result.rows[0];
			if (!job) {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 404, { message: 'Your service request was not found.' });
				return;
			}
			if (job.paymentStatus === 'paid' && job.razorpayPaymentId === body.paymentId) {
				await client.query('COMMIT');
				transactionStarted = false;
				sendJson(response, 200, { paymentStatus: 'paid', message: 'Payment was already confirmed.' });
				return;
			}
			if (job.status !== 'completed' || !job.razorpayOrderId
				|| body.orderId !== job.razorpayOrderId) {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: 'This payment order does not match a completed service request.' });
				return;
			}
			if (job.paymentStatus === 'paid') {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: 'This service request has already been paid.' });
				return;
			}
			if (!verifyRazorpaySignature(job.razorpayOrderId, body.paymentId, body.signature, credentials.keySecret)) {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 400, { message: 'Payment verification failed. No payment was recorded.' });
				return;
			}
			let payment = await razorpayRequest(
				`/payments/${encodeURIComponent(body.paymentId)}`,
				'GET',
				null,
				credentials
			);
			if (payment.order_id !== job.razorpayOrderId
				|| payment.amount !== Number(job.paymentAmountPaise)
				|| payment.currency !== 'INR') {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: 'Razorpay payment details do not match this service request.' });
				return;
			}
			if (payment.status === 'authorized' && payment.captured === false) {
				payment = await razorpayRequest(
					`/payments/${encodeURIComponent(body.paymentId)}/capture`,
					'POST',
					{ amount: Number(job.paymentAmountPaise), currency: 'INR' },
					credentials
				);
			}
			if (payment.status !== 'captured' || payment.captured !== true) {
				await client.query('ROLLBACK');
				transactionStarted = false;
				sendJson(response, 409, { message: 'Razorpay has not confirmed a captured payment for this service yet.' });
				return;
			}
			await client.query(
				`UPDATE public.jobs
				 SET payment_status = 'paid', razorpay_payment_id = $1,
					payment_paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
				 WHERE id = $2`,
				[body.paymentId, jobId]
			);
			await client.query('COMMIT');
			transactionStarted = false;
			sendJson(response, 200, { paymentStatus: 'paid', message: 'Payment received. Thank you.' });
		} catch (error) {
			if (transactionStarted) await client.query('ROLLBACK');
			if (error instanceof PaymentGatewayError) {
				sendJson(response, 502, { message: error.message });
				return;
			}
			throw error;
		} finally {
			client.release();
		}
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/jobs') {
		const result = await pool.query(
			`SELECT j.id, j.service_name AS "serviceName", j.address, j.status,
				j.created_at AS "createdAt", j.customer_latitude AS "customerLatitude",
				j.customer_longitude AS "customerLongitude",
				j.payment_status AS "paymentStatus",
				COALESCE(j.payment_amount_paise, ROUND(tech.service_rate * 100)::BIGINT)
					AS "paymentAmountPaise",
				t.username AS "technicianName",
				CASE WHEN tech.is_sharing_location
					AND tech.location_updated_at >= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
					AND tech.location_updated_at <= CURRENT_TIMESTAMP
					THEN tech.current_latitude END AS "technicianLatitude",
				CASE WHEN tech.is_sharing_location
					AND tech.location_updated_at >= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
					AND tech.location_updated_at <= CURRENT_TIMESTAMP
					THEN tech.current_longitude END AS "technicianLongitude",
				tech.location_updated_at AS "technicianLocationUpdatedAt"
			 FROM public.jobs j
			 LEFT JOIN public.technicians tech ON tech.id = j.technician_id
			 LEFT JOIN public.users t ON t.id = tech.user_id
			 WHERE j.customer_name = $1
			 ORDER BY j.created_at DESC`,
			[user.username]
		);
		sendJson(response, 200, { jobs: result.rows });
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/services') {
		const result = await pool.query(
			`SELECT id, service_name AS "serviceName", category, description, image_url AS "imageUrl"
			 FROM public.services WHERE is_active = TRUE ORDER BY category, service_name`
		);
		sendJson(response, 200, { services: result.rows });
		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/api/jobs') {
		const body = await readJson(request);
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			sendJson(response, 400, { message: 'Enter valid service request details.' });
			return;
		}
		const serviceId = parsePositiveId(String(body.serviceId ?? ''));
		const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
		const address = typeof body.address === 'string' ? body.address.trim() : '';
		const details = typeof body.details === 'string' ? body.details.trim() : '';
		const hasLatitude = body.customerLatitude !== null && body.customerLatitude !== undefined;
		const hasLongitude = body.customerLongitude !== null && body.customerLongitude !== undefined;
		const customerLatitude = hasLatitude ? body.customerLatitude : null;
		const customerLongitude = hasLongitude ? body.customerLongitude : null;
		const phoneDigits = customerPhone.replace(/\D/g, '');

		if (serviceId === null) {
			sendJson(response, 400, { message: 'Choose an available service.' });
			return;
		}
		if (phoneDigits.length < 7 || customerPhone.length > 30 || !/^\+?[\d\s().-]+$/.test(customerPhone)) {
			sendJson(response, 400, { message: 'Enter a valid phone number.' });
			return;
		}
		if (address.length < 5 || address.length > 500) {
			sendJson(response, 400, { message: 'Address must be between 5 and 500 characters.' });
			return;
		}
		if (details.length > 2000) {
			sendJson(response, 400, { message: 'Additional details must be 2,000 characters or fewer.' });
			return;
		}
		if (hasLatitude !== hasLongitude
			|| (hasLatitude && (typeof customerLatitude !== 'number' || !Number.isFinite(customerLatitude)
				|| customerLatitude < -90 || customerLatitude > 90
				|| typeof customerLongitude !== 'number' || !Number.isFinite(customerLongitude)
				|| customerLongitude < -180 || customerLongitude > 180))) {
			sendJson(response, 400, { message: 'Share a valid current location or clear the location selection.' });
			return;
		}

		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const result = await client.query(
				`INSERT INTO public.jobs
					(service_id, service_name, customer_name, customer_phone, address, details,
					 customer_latitude, customer_longitude)
				 SELECT id, service_name, $2, $3, $4, $5, $6, $7
				 FROM public.services WHERE id = $1 AND is_active = TRUE
				 RETURNING id, service_id AS "serviceId", service_name AS "serviceName",
					status, created_at AS "createdAt", customer_latitude AS "customerLatitude",
					customer_longitude AS "customerLongitude"`,
				[serviceId, user.username, customerPhone, address, details || null, customerLatitude, customerLongitude]
			);
			if (!result.rows[0]) {
				await client.query('ROLLBACK');
				sendJson(response, 404, { message: 'That service is no longer available. Refresh the service list and try again.' });
				return;
			}
			const dispatch = await autoDispatchJob(client, result.rows[0].id);
			await client.query('COMMIT');

			const job = { ...result.rows[0] };
			let message = 'No technicians are available right now. Your request is saved and remains unassigned.';
			if (dispatch.outcome === 'assigned') {
				Object.assign(job, dispatch.job, { technicianName: dispatch.technicianName });
				message = `Your request was automatically assigned to ${dispatch.technicianName}.`;
			} else if (dispatch.outcome === 'customer_location_required') {
				message = 'Your request is saved, but automatic dispatch needs your current location. It remains unassigned.';
			} else if (dispatch.outcome === 'already_processed') {
				message = 'Your service request has already been processed.';
			}
			sendJson(response, 201, { job, message });
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
		return;
	}

	sendJson(response, 404, { message: 'Not found.' });
}

async function handleAdminRequest(request, response, requestUrl) {
	if (!pool) {
		sendJson(response, 503, { message: 'Database is not configured. Set DATABASE_URL and restart the server.' });
		return;
	}
	const user = getSession(request);
	if (!user) {
		sendJson(response, 401, { message: 'Sign in as an administrator to continue.' });
		return;
	}
	if (user.role !== 'admin') {
		sendJson(response, 403, { message: 'Administrator access is required.' });
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/admin/technicians') {
		const result = await pool.query(
			`SELECT t.id, u.username, t.skill_category AS "skillCategory",
				t.is_available AS "isAvailable",
				t.phone, t.service_area AS "serviceArea", t.service_rate AS "serviceRate",
				t.profile_image_url AS "profileImageUrl", t.skills, t.achievements, t.education,
				t.current_latitude AS latitude, t.current_longitude AS longitude,
				t.is_sharing_location AS "locationSharingEnabled",
				(t.is_sharing_location
					AND t.location_updated_at >= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
					AND t.location_updated_at <= CURRENT_TIMESTAMP)
					AS "isSharingLocation",
				(t.phone IS NOT NULL AND BTRIM(t.phone) <> ''
					AND t.service_area IS NOT NULL AND BTRIM(t.service_area) <> ''
					AND t.service_rate IS NOT NULL AND t.profile_image_url IS NOT NULL
					AND BTRIM(t.skill_category) <> '') AS "profileComplete",
				t.location_updated_at AS "locationUpdatedAt"
			 FROM public.technicians t
			 JOIN public.users u ON u.id = t.user_id
			 ORDER BY u.username`
		);
		sendJson(response, 200, { technicians: result.rows });
		return;
	}

	const technicianMatch = requestUrl.pathname.match(/^\/api\/admin\/technicians\/([1-9]\d*)$/);
	if (request.method === 'PATCH' && technicianMatch) {
		const technicianId = parsePositiveId(technicianMatch[1]);
		const body = await readJson(request);
		const skillCategory = typeof body?.skillCategory === 'string' ? body.skillCategory.trim() : '';
		if (!body || typeof body !== 'object' || Array.isArray(body)
			|| skillCategory.length < 1 || skillCategory.length > 100
			|| typeof body.isAvailable !== 'boolean') {
			sendJson(response, 400, { message: 'Choose a valid skill category and availability setting.' });
			return;
		}
		const categoryResult = await pool.query(
			`SELECT 1 FROM public.services
			 WHERE is_active = TRUE AND LOWER(BTRIM(category)) = LOWER(BTRIM($1))
			 LIMIT 1`,
			[skillCategory]
		);
		if (!categoryResult.rows[0]) {
			sendJson(response, 400, { message: 'Choose a category that exists in the services list.' });
			return;
		}
		const result = await pool.query(
			`UPDATE public.technicians
			 SET skill_category = $1, is_available = $2
			 WHERE id = $3
			 RETURNING id, skill_category AS "skillCategory",
				is_available AS "isAvailable"`,
			[skillCategory, body.isAvailable, technicianId]
		);
		if (!result.rows[0]) {
			sendJson(response, 404, { message: 'Technician not found.' });
			return;
		}
		sendJson(response, 200, { technician: result.rows[0] });
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/admin/services') {
		const result = await pool.query(
			`SELECT id, service_name AS "serviceName", category, description,
				is_active AS "isActive", image_url AS "imageUrl", created_at AS "createdAt"
			 FROM public.services ORDER BY category, service_name`
		);
		sendJson(response, 200, { services: result.rows });
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/admin/jobs') {
		const result = await pool.query(
			`SELECT public.jobs.id, public.jobs.service_id AS "serviceId",
				public.jobs.service_name AS "serviceName",
				public.jobs.customer_name AS "customerName",
				public.jobs.customer_phone AS "customerPhone",
				public.jobs.address, public.jobs.details, public.jobs.status,
				public.jobs.technician_id AS "technicianId",
				public.jobs.completion_report AS "completionReport",
				public.jobs.completed_at AS "completedAt",
				public.jobs.payment_status AS "paymentStatus",
				COALESCE(public.jobs.payment_amount_paise, ROUND(tech.service_rate * 100)::BIGINT)
					AS "paymentAmountPaise",
				public.jobs.customer_latitude AS "customerLatitude",
				public.jobs.customer_longitude AS "customerLongitude",
				tech_user.username AS "technicianName",
				tech.current_latitude AS "technicianLatitude",
				tech.current_longitude AS "technicianLongitude",
				tech.is_sharing_location AS "technicianIsSharingLocation",
				public.jobs.created_at AS "createdAt", public.jobs.updated_at AS "updatedAt"
			 FROM public.jobs
			 LEFT JOIN public.technicians tech ON tech.id = public.jobs.technician_id
			 LEFT JOIN public.users tech_user ON tech_user.id = tech.user_id
			 ORDER BY public.jobs.created_at DESC`
		);
		sendJson(response, 200, { jobs: result.rows });
		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/api/admin/services') {
		await uploadImage(request, response);
		const service = validateService(request.body || {});
		if (service.error) {
			await removeUploadedImage(request.file?.path);
			sendJson(response, 400, { message: service.error });
			return;
		}
		if (request.file && !(await isValidImage(request.file))) {
			await removeUploadedImage(request.file.path);
			sendJson(response, 400, { message: 'The uploaded file is not a valid JPEG, PNG, or WebP image.' });
			return;
		}
		try {
			const result = await pool.query(
				`INSERT INTO public.services (service_name, category, description, is_active, image_url)
				 VALUES ($1, $2, $3, $4, $5)
				 RETURNING id, service_name AS "serviceName", category, description,
					is_active AS "isActive", image_url AS "imageUrl"`,
				[
					service.serviceName,
					service.category,
					service.description || null,
					service.isActive,
					request.file ? `/uploads/${request.file.filename}` : null
				]
			);
			sendJson(response, 201, { service: result.rows[0] });
		} catch (error) {
			await removeUploadedImage(request.file?.path);
			if (error.code === '23505') {
				sendJson(response, 409, { message: 'A service with that name already exists.' });
				return;
			}
			throw error;
		}
		return;
	}

	const serviceMatch = requestUrl.pathname.match(/^\/api\/admin\/services\/([1-9]\d*)$/);
	if (request.method === 'PUT' && serviceMatch) {
		const serviceId = parsePositiveId(serviceMatch[1]);
		await uploadImage(request, response);
		const service = validateService(request.body || {});
		if (service.error) {
			await removeUploadedImage(request.file?.path);
			sendJson(response, 400, { message: service.error });
			return;
		}
		if (request.file && !(await isValidImage(request.file))) {
			await removeUploadedImage(request.file.path);
			sendJson(response, 400, { message: 'The uploaded file is not a valid JPEG, PNG, or WebP image.' });
			return;
		}
		try {
			const result = await pool.query(
				`UPDATE public.services SET service_name = $1, category = $2, description = $3,
					is_active = $4, image_url = COALESCE($5, image_url)
				 WHERE id = $6
				 RETURNING id, service_name AS "serviceName", category, description,
					is_active AS "isActive", image_url AS "imageUrl"`,
				[
					service.serviceName,
					service.category,
					service.description || null,
					service.isActive,
					request.file ? `/uploads/${request.file.filename}` : null,
					serviceId
				]
			);
			if (!result.rows[0]) {
				await removeUploadedImage(request.file?.path);
				sendJson(response, 404, { message: 'Service not found.' });
				return;
			}
			sendJson(response, 200, { service: result.rows[0] });
		} catch (error) {
			await removeUploadedImage(request.file?.path);
			if (error.code === '23505') {
				sendJson(response, 409, { message: 'A service with that name already exists.' });
				return;
			}
			throw error;
		}
		return;
	}

	const jobMatch = requestUrl.pathname.match(/^\/api\/admin\/jobs\/([1-9]\d*)$/);
	if (request.method === 'PATCH' && jobMatch) {
		const jobId = parsePositiveId(jobMatch[1]);
		const body = await readJson(request);
		const validStatuses = ['requested', 'assigned', 'in_progress', 'completed', 'cancelled'];
		if (!body || typeof body !== 'object' || Array.isArray(body) || !validStatuses.includes(body.status)) {
			sendJson(response, 400, { message: 'Choose a valid job status.' });
			return;
		}
		const updatesTechnician = Object.hasOwn(body, 'technicianId');
		let technicianId = null;
		if (updatesTechnician && body.technicianId !== null) {
			technicianId = parsePositiveId(String(body.technicianId));
			if (technicianId === null) {
				sendJson(response, 400, { message: 'Choose a valid technician.' });
				return;
			}
		}
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const existingResult = await client.query(
				'SELECT technician_id AS "technicianId" FROM public.jobs WHERE id = $1 FOR UPDATE',
				[jobId]
			);
			const existingJob = existingResult.rows[0];
			if (!existingJob) {
				await client.query('ROLLBACK');
				sendJson(response, 404, { message: 'Job not found.' });
				return;
			}
			const assignedTechnicianId = updatesTechnician ? technicianId : existingJob.technicianId;
			if (['assigned', 'in_progress'].includes(body.status) && assignedTechnicianId === null) {
				await client.query('ROLLBACK');
				sendJson(response, 400, { message: 'Assign a technician before setting this job active.' });
				return;
			}
			if (assignedTechnicianId !== null && ['assigned', 'in_progress'].includes(body.status)) {
				const technician = await client.query(
					'SELECT 1 FROM public.technicians WHERE id = $1 FOR UPDATE',
					[assignedTechnicianId]
				);
				if (!technician.rows[0]) {
					await client.query('ROLLBACK');
					sendJson(response, 404, { message: 'Technician not found.' });
					return;
				}
				const activeJob = await client.query(
					`SELECT 1 FROM public.jobs
					 WHERE technician_id = $1 AND id <> $2
						AND status IN ('assigned', 'in_progress')
					 LIMIT 1`,
					[assignedTechnicianId, jobId]
				);
				if (activeJob.rows[0]) {
					await client.query('ROLLBACK');
					sendJson(response, 409, { message: 'This technician already has an active job.' });
					return;
				}
			}
			const result = await client.query(
				`UPDATE public.jobs SET status = $1,
					technician_id = CASE WHEN $3 THEN $4 ELSE technician_id END,
					completed_at = CASE WHEN $1 = 'completed'
						THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
					updated_at = CURRENT_TIMESTAMP WHERE id = $2
				 RETURNING id, status, updated_at AS "updatedAt"`,
				[body.status, jobId, updatesTechnician, technicianId]
			);
			await client.query('COMMIT');
			sendJson(response, 200, { job: result.rows[0] });
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
		return;
	}

	sendJson(response, 404, { message: 'Not found.' });
}

async function handleTechnicianRequest(request, response, requestUrl) {
	if (!pool) {
		sendJson(response, 503, { message: 'Database is not configured. Set DATABASE_URL and restart the server.' });
		return;
	}
	const user = getSession(request);
	if (!user) {
		sendJson(response, 401, { message: 'Sign in as a technician to update your location.' });
		return;
	}
	if (user.role !== 'technician') {
		sendJson(response, 403, { message: 'Technician access is required.' });
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/technician/profile') {
		const [profileResult, categoriesResult] = await Promise.all([
			pool.query(
				`SELECT t.id, u.username, t.phone, t.service_area AS "serviceArea",
					t.service_rate AS "serviceRate", t.profile_image_url AS "profileImageUrl",
					t.skill_category AS "skillCategory", t.skills, t.achievements, t.education,
					t.is_available AS "isAvailable",
					(t.is_sharing_location
						AND t.location_updated_at >= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
						AND t.location_updated_at <= CURRENT_TIMESTAMP)
						AS "locationOnline",
					(t.phone IS NOT NULL AND BTRIM(t.phone) <> ''
						AND t.service_area IS NOT NULL AND BTRIM(t.service_area) <> ''
						AND t.service_rate IS NOT NULL AND t.profile_image_url IS NOT NULL
						AND BTRIM(t.skill_category) <> '') AS "profileComplete"
				 FROM public.technicians t
				 JOIN public.users u ON u.id = t.user_id
				 WHERE t.user_id = $1`,
				[user.id]
			),
			pool.query(
				`SELECT DISTINCT category FROM public.services
				 WHERE is_active = TRUE ORDER BY category`
			)
		]);
		if (!profileResult.rows[0]) {
			sendJson(response, 404, { message: 'Technician profile not found.' });
			return;
		}
		sendJson(response, 200, {
			profile: profileResult.rows[0],
			categories: categoriesResult.rows.map(row => row.category)
		});
		return;
	}

	if (request.method === 'PUT' && requestUrl.pathname === '/api/technician/profile') {
		await new Promise((resolve, reject) => {
			technicianProfileImageUpload(request, response, error => {
				if (error) reject(error);
				else resolve();
			});
		});
		const body = request.body || {};
		const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
		const phoneDigits = phone.replace(/\D/g, '');
		const serviceArea = typeof body.serviceArea === 'string' ? body.serviceArea.trim() : '';
		const skillCategory = typeof body.skillCategory === 'string' ? body.skillCategory.trim() : '';
		const rateValue = typeof body.serviceRate === 'string' ? body.serviceRate.trim() : '';
		const serviceRate = Number(rateValue);
		const skills = typeof body.skills === 'string' ? body.skills.trim() : '';
		const achievements = typeof body.achievements === 'string' ? body.achievements.trim() : '';
		const education = typeof body.education === 'string' ? body.education.trim() : '';
		const isAvailable = body.isAvailable === 'true';
		let invalidMessage = '';
		if (phoneDigits.length < 7 || phone.length > 30 || !/^\+?[\d\s().-]+$/.test(phone)) {
			invalidMessage = 'Enter a valid contact phone number.';
		} else if (serviceArea.length < 2 || serviceArea.length > 500) {
			invalidMessage = 'Enter a service location between 2 and 500 characters.';
		} else if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(rateValue) || !Number.isFinite(serviceRate)) {
			invalidMessage = 'Enter a valid service rate with up to two decimal places.';
		} else if (serviceRate < 1) {
			invalidMessage = 'Set a starting service rate of at least ₹1.00 for online payments.';
		} else if (skillCategory.length < 1 || skillCategory.length > 100) {
			invalidMessage = 'Choose a service category.';
		} else if (body.isAvailable !== undefined
			&& body.isAvailable !== 'true' && body.isAvailable !== 'false') {
			invalidMessage = 'Choose whether you are available for new jobs.';
		} else if (skills.length > 1000 || achievements.length > 2000 || education.length > 500) {
			invalidMessage = 'Optional profile details exceed the allowed length.';
		}
		if (invalidMessage) {
			await removeUploadedImage(request.file?.path);
			sendJson(response, 400, { message: invalidMessage });
			return;
		}
		if (request.file && !(await isValidImage(request.file))) {
			await removeUploadedImage(request.file.path);
			sendJson(response, 400, { message: 'The uploaded file is not a valid JPEG, PNG, or WebP image.' });
			return;
		}

		let profileUpdated = false;
		try {
			const categoryResult = await pool.query(
				`SELECT 1 FROM public.services
				 WHERE is_active = TRUE AND LOWER(BTRIM(category)) = LOWER(BTRIM($1))
				 LIMIT 1`,
				[skillCategory]
			);
			if (!categoryResult.rows[0]) {
				await removeUploadedImage(request.file?.path);
				sendJson(response, 400, { message: 'Choose a current category from the services list.' });
				return;
			}
			const existingResult = await pool.query(
				'SELECT profile_image_url AS "profileImageUrl" FROM public.technicians WHERE user_id = $1',
				[user.id]
			);
			if (!existingResult.rows[0]) {
				await removeUploadedImage(request.file?.path);
				sendJson(response, 404, { message: 'Technician profile not found.' });
				return;
			}
			if (!request.file && !existingResult.rows[0].profileImageUrl) {
				sendJson(response, 400, { message: 'Upload a profile photo to finish setting up your technician profile.' });
				return;
			}
			const result = await pool.query(
				`UPDATE public.technicians
				 SET phone = $1, service_area = $2, service_rate = $3,
					skill_category = $4, skills = $5, achievements = $6, education = $7,
					is_available = $8, profile_image_url = COALESCE($9, profile_image_url)
				 WHERE user_id = $10
				 RETURNING id, phone, service_area AS "serviceArea",
					service_rate AS "serviceRate", profile_image_url AS "profileImageUrl",
					skill_category AS "skillCategory", skills, achievements, education,
					is_available AS "isAvailable"`,
				[
					phone, serviceArea, serviceRate, skillCategory, skills || null,
					achievements || null, education || null, isAvailable,
					request.file ? `/uploads/${request.file.filename}` : null,
					user.id
				]
			);
			if (!result.rows[0]) {
				await removeUploadedImage(request.file?.path);
				sendJson(response, 404, { message: 'Technician profile not found.' });
				return;
			}
			profileUpdated = true;
			const oldImageMatch = existingResult.rows[0].profileImageUrl
				?.match(/^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/);
			if (request.file && oldImageMatch) {
				try {
					await removeUploadedImage(path.join(uploadsDirectory, oldImageMatch[1]));
				} catch (error) {
					console.error('Could not remove the previous technician profile photo:', error);
				}
			}
			sendJson(response, 200, { profile: result.rows[0], message: 'Your technician profile has been saved.' });
		} catch (error) {
			if (!profileUpdated) await removeUploadedImage(request.file?.path);
			throw error;
		}
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/api/technician/jobs') {
		const result = await pool.query(
			`SELECT j.id, j.service_name AS "serviceName", j.customer_name AS "customerName",
				j.customer_phone AS "customerPhone", j.address, j.details, j.status,
				j.completion_report AS "completionReport", j.created_at AS "createdAt",
				j.updated_at AS "updatedAt"
			 FROM public.jobs j
			 JOIN public.technicians t ON t.id = j.technician_id
			 WHERE t.user_id = $1 AND j.status IN ('assigned', 'in_progress')
			 ORDER BY j.created_at`,
			[user.id]
		);
		sendJson(response, 200, { jobs: result.rows });
		return;
	}

	const technicianJobMatch = requestUrl.pathname.match(/^\/api\/technician\/jobs\/([1-9]\d*)$/);
	if (request.method === 'PATCH' && technicianJobMatch) {
		const jobId = parsePositiveId(technicianJobMatch[1]);
		const body = await readJson(request);
		if (!body || typeof body !== 'object' || Array.isArray(body)
			|| !['in_progress', 'completed'].includes(body.status)) {
			sendJson(response, 400, { message: 'Choose a valid work update.' });
			return;
		}
		const completionReport = typeof body.completionReport === 'string'
			? body.completionReport.trim()
			: '';
		if (body.status === 'completed' && (completionReport.length < 5 || completionReport.length > 2000)) {
			sendJson(response, 400, { message: 'Write a completion update between 5 and 2,000 characters.' });
			return;
		}
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const jobResult = await client.query(
				`SELECT j.status FROM public.jobs j
				 JOIN public.technicians t ON t.id = j.technician_id
				 WHERE j.id = $1 AND t.user_id = $2
				 FOR UPDATE OF j`,
				[jobId, user.id]
			);
			const job = jobResult.rows[0];
			if (!job) {
				await client.query('ROLLBACK');
				sendJson(response, 404, { message: 'Assigned job not found.' });
				return;
			}
			const validTransition = body.status === 'in_progress'
				? job.status === 'assigned'
				: job.status === 'in_progress';
			if (!validTransition) {
				await client.query('ROLLBACK');
				sendJson(response, 409, { message: 'This job has already changed. Refresh your assigned jobs and try again.' });
				return;
			}
			const result = await client.query(
				`UPDATE public.jobs
				 SET status = $1,
					completion_report = CASE WHEN $1 = 'completed' THEN $2 ELSE completion_report END,
					completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
					updated_at = CURRENT_TIMESTAMP
				 WHERE id = $3
				 RETURNING id, status, completion_report AS "completionReport",
					completed_at AS "completedAt"`,
				[body.status, completionReport || null, jobId]
			);
			await client.query('COMMIT');
			sendJson(response, 200, {
				job: result.rows[0],
				message: body.status === 'completed'
					? 'Completion report sent to admin.'
					: 'Job marked ready and in progress.'
			});
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
		return;
	}

	if (request.method !== 'POST' || requestUrl.pathname !== '/api/technician/location') {
		sendJson(response, 404, { message: 'Not found.' });
		return;
	}

	const body = await readJson(request);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		sendJson(response, 400, { message: 'Enter valid location details.' });
		return;
	}
	if (body.sharing === false) {
		const result = await pool.query(
			`UPDATE public.technicians SET is_sharing_location = FALSE
			 WHERE user_id = $1 RETURNING id`,
			[user.id]
		);
		if (!result.rows[0]) {
			sendJson(response, 404, { message: 'Technician profile not found.' });
			return;
		}
		sendJson(response, 200, { message: 'Location sharing stopped.' });
		return;
	}

	const { latitude, longitude } = body;
	if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
		|| typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
		sendJson(response, 400, { message: 'Share valid latitude and longitude coordinates.' });
		return;
	}
	const result = await pool.query(
		`UPDATE public.technicians
		 SET current_latitude = $1, current_longitude = $2,
			location_updated_at = CURRENT_TIMESTAMP, is_sharing_location = TRUE
		 WHERE user_id = $3
		 RETURNING id`,
		[latitude, longitude, user.id]
	);
	if (!result.rows[0]) {
		sendJson(response, 404, { message: 'Technician profile not found.' });
		return;
	}
	sendJson(response, 200, { message: 'Your location is being shared with dispatch.' });
}

async function seedAdminAccount() {
	const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
	if (!username || !password) return;
	const passwordHash = await hashPassword(password);
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await client.query(
			`INSERT INTO users (username, password_hash, role)
			 VALUES ($1, $2, 'admin') ON CONFLICT (username) DO NOTHING
			 RETURNING id`,
			[username.trim(), passwordHash]
		);
		if (result.rows[0]) {
			await client.query(
				'INSERT INTO admins (user_id, username, password_hash) VALUES ($1, $2, $3)',
				[result.rows[0].id, username.trim(), passwordHash]
			);
		}
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function handleAuth(request, response, action) {
	if (!pool) {
		sendJson(response, 503, { message: 'Database is not configured. Set DATABASE_URL and restart the server.' });
		return;
	}

	const { username, password, role } = await readJson(request);
	if (typeof role !== 'string' || !Object.hasOwn(roles, role)) {
		sendJson(response, 400, { message: 'Choose a valid account type.' });
		return;
	}
	if (typeof username !== 'string' || typeof password !== 'string') {
		sendJson(response, 400, { message: 'Enter a username and password.' });
		return;
	}

	const normalizedUsername = username.trim();
	if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
		sendJson(response, 400, { message: 'Username must be between 3 and 50 characters.' });
		return;
	}
	if (action === 'signup' && (password.length < 8 || password.length > 200)) {
		sendJson(response, 400, { message: 'Password must be at least 8 characters.' });
		return;
	}

	const roleConfig = roles[role];
	if (action === 'signup') {
		if (role === 'admin') {
			sendJson(response, 403, { message: 'Admin accounts must be provisioned by the system administrator.' });
			return;
		}
		const passwordHash = await hashPassword(password);
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const result = await client.query(
				'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
				[normalizedUsername, passwordHash, roleConfig.databaseRole]
			);
			await client.query(
				`INSERT INTO ${roleConfig.profileTable} (user_id) VALUES ($1)`,
				[result.rows[0].id]
			);
			await client.query('COMMIT');
			sendJson(response, 201, { message: 'Account created. You can now sign in.' });
		} catch (error) {
			await client.query('ROLLBACK');
			if (error.code === '23505') {
				sendJson(response, 409, { message: 'That username is already registered.' });
				return;
			}
			throw error;
		} finally {
			client.release();
		}
		return;
	}

	const result = role === 'admin'
		? await pool.query(
			'SELECT id, username, password_hash FROM admins WHERE username = $1',
			[normalizedUsername]
		)
		: await pool.query(
			'SELECT id, username, password_hash FROM users WHERE username = $1 AND role = $2',
			[normalizedUsername, roleConfig.databaseRole]
		);
	const account = result.rows[0];
	if (!account || !(await verifyPassword(password, account.password_hash))) {
		sendJson(response, 401, { message: 'Incorrect username, password, or account type.' });
		return;
	}
	const user = { id: account.id, username: account.username, role };
	setSessionCookie(response, createSessionToken(user));
	sendJson(response, 200, {
		message: `Signed in as ${roleConfig.databaseRole}.`,
		user
	});
}

async function handleRequest(request, response) {
	const requestUrl = new URL(request.url, 'http://localhost');
	if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
		sendJson(response, 200, { status: 'ok' });
		return;
	}
	if (request.method === 'GET' && requestUrl.pathname === '/readyz') {
		if (!pool) {
			sendJson(response, 503, { status: 'not_ready' });
			return;
		}
		try {
			await pool.query('SELECT 1');
		} catch (error) {
			console.error('Readiness check failed:', error);
			sendJson(response, 503, { status: 'not_ready' });
			return;
		}
		sendJson(response, 200, { status: 'ready' });
		return;
	}
	if (request.method === 'POST' && requestUrl.pathname === '/api/payments/razorpay/webhook') {
		await handleRazorpayWebhook(request, response);
		return;
	}
	if (requestUrl.pathname === '/api/services'
		|| requestUrl.pathname === '/api/jobs'
		|| requestUrl.pathname.startsWith('/api/jobs/')) {
		await handleCustomerRequest(request, response, requestUrl);
		return;
	}
	if (requestUrl.pathname.startsWith('/api/technician/')) {
		await handleTechnicianRequest(request, response, requestUrl);
		return;
	}
	if (requestUrl.pathname.startsWith('/api/admin/')) {
		await handleAdminRequest(request, response, requestUrl);
		return;
	}
	if (request.method === 'GET' && requestUrl.pathname === '/api/maps-config') {
		sendJson(response, 200, { apiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
		return;
	}
	if (request.method === 'GET' && requestUrl.pathname === '/api/session') {
		const user = getSession(request);
		sendJson(response, 200, { user });
		return;
	}
	const imageMatch = requestUrl.pathname.match(/^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/);
	if (request.method === 'GET' && imageMatch) {
		const fileName = imageMatch[1];
		const extension = path.extname(fileName);
		const contentType = Object.values(imageTypes).find(type => type.extension === extension).contentType;
		const contents = await fs.readFile(path.join(uploadsDirectory, fileName));
		response.writeHead(200, {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff'
		});
		response.end(contents);
		return;
	}
	if (request.method === 'POST' && requestUrl.pathname === '/api/logout') {
		const user = getSession(request);
		if (user) {
			if (user.role === 'technician' && pool) {
				await pool.query(
					'UPDATE public.technicians SET is_sharing_location = FALSE WHERE user_id = $1',
					[user.id]
				);
			}
			revokedSessions.set(user.sessionId, user.expiresAt);
			pruneRevokedSessions();
		}
		clearSessionCookie(response);
		sendJson(response, 200, { message: 'You have been signed out.' });
		return;
	}
	if (request.method === 'POST' && requestUrl.pathname === '/api/login') {
		await handleAuth(request, response, 'login');
		return;
	}
	if (request.method === 'POST' && requestUrl.pathname === '/api/signup') {
		await handleAuth(request, response, 'signup');
		return;
	}
	if (request.method === 'GET' && staticFiles[requestUrl.pathname]) {
		const [fileName, contentType] = staticFiles[requestUrl.pathname];
		const contents = await fs.readFile(path.join(__dirname, fileName));
		response.writeHead(200, { 'Content-Type': contentType });
		response.end(contents);
		return;
	}
	sendJson(response, 404, { message: 'Not found.' });
}

const server = http.createServer((request, response) => {
	handleRequest(request, response).catch(error => {
		console.error(error);
		if (!response.headersSent) {
			const isUploadError = error instanceof multer.MulterError
				|| error.message === 'Upload a JPEG, PNG, or WebP image.';
			const statusCode = error instanceof PayloadTooLargeError
				|| (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
				? 413
				: isUploadError ? 400 : 500;
			sendJson(response, statusCode, {
				message: error instanceof PayloadTooLargeError || isUploadError
					? error.message
					: 'The request could not be completed.'
			});
		} else {
			response.destroy();
		}
	});
});

async function startServer() {
	await fs.mkdir(uploadsDirectory, { recursive: true });
	if (pool) {
		await verifySchema();
		await seedAdminAccount();
	} else {
		console.warn('DATABASE_URL is not set. Authentication endpoints will be unavailable.');
	}
	const port = Number(process.env.PORT || 3000);
	server.listen(port, () => console.log(`Emergency Auto Dispatch listening on http://localhost:${port}`));
}

startServer().catch(error => {
	console.error('Could not initialize the database:', error);
	process.exitCode = 1;
	if (pool) pool.end();
});
