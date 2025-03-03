/**
 * Safely attempt to import a module and return null if it fails
 */
export async function tryImport<T>(importPromise: Promise<T>): Promise<T | null> {
  try {
    return await importPromise;
  } catch (error) {
    console.warn('Import failed:', error);
    return null;
  }
} 