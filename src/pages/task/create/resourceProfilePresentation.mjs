export function listCpuTrainingResourceProfiles(plan) {
  const seen = new Set();
  const profiles = [];
  for (const runtime of plan?.runtimes || []) {
    if (runtime?.deviceType !== 'CPU') continue;
    for (const profile of runtime?.resourceProfiles || []) {
      if (
        !profile?.id ||
        Number(profile.gpuCount || 0) !== 0 ||
        seen.has(profile.id)
      ) {
        continue;
      }
      seen.add(profile.id);
      profiles.push({
        ...profile,
        runtimeId: runtime.id,
        deviceType: runtime.deviceType,
      });
    }
  }
  return profiles;
}

export function firstCpuTrainingResourceProfileId(plan) {
  return listCpuTrainingResourceProfiles(plan)[0]?.id;
}

export function isCpuTrainingResourceProfileIdAllowed(profiles, profileId) {
  return (
    typeof profileId === 'string' &&
    profileId.length > 0 &&
    profiles.some((profile) => profile.id === profileId)
  );
}
