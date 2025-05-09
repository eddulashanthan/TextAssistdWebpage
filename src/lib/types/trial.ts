// src/lib/types/trial.ts

export interface ActivateTrialRequest {
  deviceId: string;
  // Consider adding appVersion, osVersion if useful for analytics or logic
}

export interface ServerTrialState {
  isActive: boolean;
  trialId?: string; // Optional: if you want to return the trial record ID
  deviceId?: string;
  trialActivatedAt?: string | null; // ISO date string
  trialExpiresAt?: string | null; // ISO date string
  remainingDays?: number;
  message?: string;
  error?: string; // For error responses from the API endpoint itself
  // Include any other fields your Swift app's ServerTrialState expects
}
