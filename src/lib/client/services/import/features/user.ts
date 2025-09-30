import type { UserValidationResult } from '$lib/types';

// User validation and resolution functions for CSV import

// User validation functions
export async function validateUserById(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/users?id=${encodeURIComponent(userId)}`);
    if (!response.ok) return false;
    const users = await response.json();
    return users.length > 0;
  } catch (error) {
    console.error('Error validating user by ID:', error);
    return false;
  }
}

export async function validateUserByEmail(
  email: string
): Promise<{ isValid: boolean; userId?: string }> {
  try {
    const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
    if (!response.ok) return { isValid: false };
    const users = await response.json();
    return {
      isValid: users.length > 0,
      userId: users.length > 0 ? users[0].id : undefined
    };
  } catch (error) {
    console.error('Error validating user by email:', error);
    return { isValid: false };
  }
}

export async function validateUserByUsername(
  username: string
): Promise<{ isValid: boolean; userId?: string }> {
  try {
    const response = await fetch(`/api/users?username=${encodeURIComponent(username)}`);
    if (!response.ok) return { isValid: false };
    const users = await response.json();
    return {
      isValid: users.length > 0,
      userId: users.length > 0 ? users[0].id : undefined
    };
  } catch (error) {
    console.error('Error validating user by username:', error);
    return { isValid: false };
  }
}

export async function searchUsers(query: string): Promise<any[]> {
  try {
    const response = await fetch(`/api/users?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

// User selection functions
export async function handleUserSearch(query: string): Promise<any[]> {
  if (query.length < 2) {
    return [];
  }
  return await searchUsers(query);
}

export function selectUser(user: any, setFallbackUserId: (id: string) => void) {
  setFallbackUserId(user.id);
  return user;
}

// User resolution search function
export async function handleResolutionUserSearch(query: string): Promise<any[]> {
  if (query.length < 2) {
    return [];
  }
  return await searchUsers(query);
}

// User resolution functions
export function setUserResolution(
  invalidValue: string,
  userId: string,
  userData: any,
  resolutions: Map<string, { userId: string; userData?: any }>
): Map<string, { userId: string; userData?: any }> {
  resolutions.set(invalidValue, { userId, userData });
  return new Map(resolutions);
}

export function removeUserResolution(
  invalidValue: string,
  resolutions: Map<string, { userId: string; userData?: any }>
): Map<string, { userId: string; userData?: any }> {
  resolutions.delete(invalidValue);
  return new Map(resolutions);
}

export function canCompleteUserResolution(
  invalidValues: string[],
  resolutions: Map<string, { userId: string; userData?: any }>
): boolean {
  return invalidValues.every((value) => resolutions.has(value));
}

export function selectUserForResolution(
  invalidValue: string,
  user: any,
  resolutions: Map<string, { userId: string; userData?: any }>
): Map<string, { userId: string; userData?: any }> {
  return setUserResolution(invalidValue, user.id, user, resolutions);
}

export function resetUserResolution(
  invalidValue: string,
  resolutions: Map<string, { userId: string; userData?: any }>
): Map<string, { userId: string; userData?: any }> {
  return removeUserResolution(invalidValue, resolutions);
}

// User validation orchestration
export async function validateUsers(
  userColumns: any[],
  sampleData: string[][],
  headers: string[],
  onProgress: (progress: number, total: number) => void,
  onResults: (results: UserValidationResult[]) => void
): Promise<{ invalidCount: number; results: UserValidationResult[] }> {
  // Get unique user values from all user columns
  const userValues = new Set<string>();
  const userColumnIndices = userColumns.map((col) => headers.indexOf(col.header));

  // Collect all user values from the data
  sampleData.forEach((row) => {
    userColumnIndices.forEach((colIndex) => {
      const value = row[colIndex]?.trim();
      if (value) {
        userValues.add(value);
      }
    });
  });

  const uniqueValues = Array.from(userValues);
  const results: UserValidationResult[] = [];
  const userField = userColumns[0].field; // Use first user column's field type

  // Validate each unique user value
  for (let i = 0; i < uniqueValues.length; i++) {
    const value = uniqueValues[i];

    let result: UserValidationResult;

    try {
      if (userField === 'id') {
        const isValid = await validateUserById(value);
        result = { value, isValid, userId: isValid ? value : undefined };
      } else if (userField === 'email') {
        const validation = await validateUserByEmail(value);
        result = { value, isValid: validation.isValid, userId: validation.userId };
      } else if (userField === 'username') {
        const validation = await validateUserByUsername(value);
        result = { value, isValid: validation.isValid, userId: validation.userId };
      } else {
        result = { value, isValid: false, error: 'Unknown field type' };
      }
    } catch (error) {
      result = {
        value,
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }

    results.push(result);
    onProgress(i + 1, uniqueValues.length);

    // Small delay to show progress
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  onResults(results);

  // Check if all validations passed
  const invalidResults = results.filter((r) => !r.isValid);
  return { invalidCount: invalidResults.length, results };
}

/**
 * Enrich feature data with validated user IDs
 */
export function enrichFeaturesWithUserData(
  importCtx: ImportCtx,
  validationResults: UserValidationResult[]
): void {
  console.log('🔧 Enriching features with validated user data...');

  const data = importCtx.getData();
  const columns = importCtx.getColumns();
  const headers = importCtx.getHeaders();

  // Find user columns
  const userColumns = columns.filter((col) => col.modelType === 'User');
  if (userColumns.length === 0) {
    console.log('🔧 No user columns found, using fallback user for all features');
    // If no user columns, all features should use the fallback user
    const userValidation = importCtx.getUserValidation();
    if (userValidation.fallbackUserId) {
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const enriched = importCtx.getRowEnrichedData(rowIndex) || {};
        enriched.user = { id: userValidation.fallbackUserId };
        importCtx.setRowEnrichedData(rowIndex, enriched);
      }
    }
    return;
  }

  // Create a map of user values to user IDs
  const userValueToId = new Map<string, string>();
  validationResults.forEach((result) => {
    if (result.isValid && result.userId) {
      userValueToId.set(result.value, result.userId);
    }
  });

  // Also check user resolution for any resolved values
  const userResolution = importCtx.getUserResolution();
  userResolution.resolutions.forEach((resolution, invalidValue) => {
    if (resolution.userId) {
      userValueToId.set(invalidValue, resolution.userId);
    }
  });

  console.log('🔧 User value to ID mapping:', Object.fromEntries(userValueToId));

  // Get column indices for user columns
  const userColumnIndices = userColumns.map((col) => ({
    index: headers.indexOf(col.header),
    field: col.field
  }));

  // Enrich each row with user data
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    const enriched = importCtx.getRowEnrichedData(rowIndex) || {};

    // Check each user column for this row
    for (const { index, field } of userColumnIndices) {
      const userValue = row[index]?.trim();
      if (userValue && userValueToId.has(userValue)) {
        const userId = userValueToId.get(userValue)!;
        enriched.user = { id: userId };
        console.log(
          `🔧 Row ${rowIndex + 1}: Set user ID ${userId} for value "${userValue}"`
        );
        break; // Use first matching user column
      }
    }

    // If no user found but we have a fallback, use it
    if (!enriched.user) {
      const userValidation = importCtx.getUserValidation();
      if (userValidation.fallbackUserId) {
        enriched.user = { id: userValidation.fallbackUserId };
        console.log(
          `🔧 Row ${rowIndex + 1}: Using fallback user ID ${userValidation.fallbackUserId}`
        );
      }
    }

    importCtx.setRowEnrichedData(rowIndex, enriched);
  }

  console.log('✅ User data enrichment completed');
}

export function startUserResolution(results: UserValidationResult[]): {
  invalidValues: string[];
  resolutions: Map<string, { userId: string; userData?: any }>;
} {
  const invalidResults = results.filter((r) => !r.isValid);
  return {
    invalidValues: invalidResults.map((r) => r.value),
    resolutions: new Map()
  };
}
