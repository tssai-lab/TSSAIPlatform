export function listUsableCpuInferenceProfiles(profiles) {
  const seen = new Set();
  return (profiles || []).filter((profile) => {
    if (
      !profile?.id ||
      profile.deviceType !== 'CPU' ||
      Number(profile.gpuCount || 0) !== 0 ||
      seen.has(profile.id)
    ) {
      return false;
    }
    seen.add(profile.id);
    return true;
  });
}

export function defaultInferenceResourceProfileId(profiles) {
  return listUsableCpuInferenceProfiles(profiles)[0]?.id;
}
