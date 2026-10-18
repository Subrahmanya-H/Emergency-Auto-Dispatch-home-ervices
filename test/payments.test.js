'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
	toRazorpayPaise,
	verifyRazorpaySignature,
	verifyRazorpayWebhookSignature
} = require('../payments');

test('converts a rupee amount to exact paise', () => {
	assert.equal(toRazorpayPaise('1250.50'), 125050);
});

test('rejects zero, invalid, and unsafe payment amounts', () => {
	for (const amount of [0, -1, 'not a price', Number.MAX_SAFE_INTEGER]) {
		assert.throws(() => toRazorpayPaise(amount), RangeError);
	}
});

test('verifies a Razorpay checkout signature', () => {
	const orderId = 'order_123abc';
	const paymentId = 'pay_456def';
	const secret = 'test-secret';
	const signature = createHmac('sha256', secret)
		.update(`${orderId}|${paymentId}`)
		.digest('hex');

	assert.equal(verifyRazorpaySignature(orderId, paymentId, signature, secret), true);
	assert.equal(verifyRazorpaySignature(orderId, paymentId, `${signature.slice(0, -1)}0`, secret), false);
	assert.equal(verifyRazorpaySignature(orderId, paymentId, signature, 'different-secret'), false);
});

test('rejects malformed Razorpay signatures and payment identifiers', () => {
	assert.equal(verifyRazorpaySignature('order_123abc', 'bad-id', 'a'.repeat(64), 'secret'), false);
	assert.equal(verifyRazorpaySignature('order_123abc', 'pay_456def', 'invalid', 'secret'), false);
});

test('verifies Razorpay webhooks against the exact raw request body', () => {
	const body = Buffer.from('{"event":"payment.captured"}');
	const secret = 'webhook-secret';
	const signature = createHmac('sha256', secret).update(body).digest('hex');

	assert.equal(verifyRazorpayWebhookSignature(body, signature, secret), true);
	assert.equal(verifyRazorpayWebhookSignature(Buffer.from(`${body} `), signature, secret), false);
	assert.equal(verifyRazorpayWebhookSignature(body, signature, ''), false);
});
