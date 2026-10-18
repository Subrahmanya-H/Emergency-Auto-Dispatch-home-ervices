const test = require('node:test');
const assert = require('node:assert/strict');
const { findNearestEligibleTechnician } = require('../dispatch');

const now = Date.parse('2026-10-17T12:00:00.000Z');
const job = { latitude: 12.9716, longitude: 77.5946, category: 'Emergency Response' };

function technician(overrides = {}) {
	return {
		id: 1,
		skillCategory: 'Emergency Response',
		isAvailable: true,
		isSharingLocation: true,
		profileComplete: true,
		latitude: 12.972,
		longitude: 77.595,
		locationUpdatedAt: new Date(now - 1000),
		hasActiveJob: false,
		...overrides
	};
}

test('no eligible technician leaves the job unassigned', () => {
	assert.equal(findNearestEligibleTechnician(job, [], now), null);
});

test('one eligible technician is selected', () => {
	const candidate = technician();
	assert.equal(findNearestEligibleTechnician(job, [candidate], now).id, candidate.id);
});

test('the nearest eligible technician is selected', () => {
	const farther = technician({ id: 2, latitude: 13.1, longitude: 77.8 });
	const nearer = technician({ id: 3, latitude: 12.9717, longitude: 77.5947 });
	assert.equal(findNearestEligibleTechnician(job, [farther, nearer], now).id, nearer.id);
});

test('technicians with location sharing off are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ isSharingLocation: false })
	], now), null);
});

test('technicians with stale locations are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ locationUpdatedAt: new Date(now - 30001) })
	], now), null);
});

test('technicians with future-dated locations are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ locationUpdatedAt: new Date(now + 1) })
	], now), null);
});

test('technicians with an active job are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ hasActiveJob: true })
	], now), null);
});

test('technicians with incomplete profiles are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ profileComplete: false })
	], now), null);
});

test('unavailable technicians are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ isAvailable: false })
	], now), null);
});

test('technicians without the requested category are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ skillCategory: 'Home Repairs' })
	], now), null);
});

test('technicians without valid coordinates are excluded', () => {
	assert.equal(findNearestEligibleTechnician(job, [
		technician({ latitude: null })
	], now), null);
});

test('missing customer coordinates leave the job unmatched', () => {
	assert.equal(findNearestEligibleTechnician({ ...job, latitude: null }, [
		technician()
	], now), null);
});
