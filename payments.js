'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

function toRazorpayPaise(amount) {
	const rupees = Number(amount);
	const paise = Math.round((rupees + Number.EPSILON) * 100);
	if (!Number.isFinite(rupees) || rupees < 1 || !Number.isSafeInteger(paise)) {
		throw new RangeError('The technician starting rate must be at least ₹1.00 to accept online payment.');
	}
	return paise;
}

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
	if (typeof orderId !== 'string' || typeof paymentId !== 'string'
		|| !/^pay_[A-Za-z0-9]+$/.test(paymentId)
		|| typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) {
		return false;
	}
	return verifyRazorpayWebhookSignature(Buffer.from(`${orderId}|${paymentId}`), signature, secret);
}

function verifyRazorpayWebhookSignature(body, signature, secret) {
	if (!Buffer.isBuffer(body)
		|| typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)
		|| typeof secret !== 'string' || !secret) {
		return false;
	}
	const expected = createHmac('sha256', secret)
		.update(body)
		.digest();
	const provided = Buffer.from(signature, 'hex');
	return provided.length === expected.length && timingSafeEqual(provided, expected);
}

module.exports = {
	toRazorpayPaise,
	verifyRazorpaySignature,
	verifyRazorpayWebhookSignature
};
