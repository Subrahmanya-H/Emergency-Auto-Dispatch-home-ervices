function calculateDistanceKm(lat1, lon1, lat2, lon2) {
	const toRadians = degrees => degrees * Math.PI / 180;
	const earthRadiusKm = 6371;
	const latitudeDifference = toRadians(lat2 - lat1);
	const longitudeDifference = toRadians(lon2 - lon1);
	const haversine = Math.sin(latitudeDifference / 2) ** 2
		+ Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
		* Math.sin(longitudeDifference / 2) ** 2;
	return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function findNearestEligibleTechnician(job, technicians, now = Date.now()) {
	if (!Number.isFinite(Number(job.latitude)) || !Number.isFinite(Number(job.longitude))
		|| job.latitude === null || job.latitude === undefined
		|| job.longitude === null || job.longitude === undefined) return null;

	const candidates = technicians.filter(technician => {
		if (technician.latitude === null || technician.latitude === undefined
			|| technician.longitude === null || technician.longitude === undefined) return false;
		const latitude = Number(technician.latitude);
		const longitude = Number(technician.longitude);
		const updatedAt = new Date(technician.locationUpdatedAt).getTime();
		return technician.isAvailable === true
			&& technician.isSharingLocation === true
			&& technician.profileComplete === true
			&& technician.hasActiveJob !== true
			&& typeof technician.skillCategory === 'string'
			&& technician.skillCategory.trim().toLowerCase()
				=== String(job.category || '').trim().toLowerCase()
			&& Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
			&& Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
			&& Number.isFinite(updatedAt) && updatedAt >= now - 30000 && updatedAt <= now;
	}).map(technician => ({
		...technician,
		distanceKm: calculateDistanceKm(
			Number(job.latitude),
			Number(job.longitude),
			Number(technician.latitude),
			Number(technician.longitude)
		)
	}));
	candidates.sort((first, second) => first.distanceKm - second.distanceKm);
	return candidates[0] || null;
}

module.exports = { calculateDistanceKm, findNearestEligibleTechnician };
