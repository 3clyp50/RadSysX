import * as cornerstone3D from '@cornerstonejs/core';
import { RenderingEngine } from '@cornerstonejs/core';
import { 
  initializeCornerstone3D, 
  cleanupCornerstone3D,
  createRenderingEngine,
  validateImageIds
} from '@/lib/utils/cornerstone3DInit';

// Track rendering engines by ID
interface RenderingEngineTracker {
  [id: string]: {
    engine: RenderingEngine;
    refCount: number;
    viewType: string;
  };
}

class CornerstoneService {
  private initialized = false;
  private initializing = false;
  private initPromise: Promise<void> | null = null;
  private renderingEngines: RenderingEngineTracker = {};
  private initError: Error | null = null;
  private maxRetries = 3;
  private retryCount = 0;

  /**
   * Initialize Cornerstone3D once
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // If we've failed too many times, don't retry automatically
    if (this.initError && this.retryCount >= this.maxRetries) {
      console.error(`CornerstoneService: Maximum retries (${this.maxRetries}) reached. Initialization failed.`);
      throw this.initError;
    }
    
    // If initialization is already in progress, return the existing promise
    if (this.initializing && this.initPromise) {
      return this.initPromise;
    }
    
    this.initializing = true;
    this.initPromise = new Promise<void>((resolve, reject) => {
      initializeCornerstone3D()
        .then(() => {
          this.initialized = true;
          this.initializing = false;
          this.initError = null;
          this.retryCount = 0;
          console.log('CornerstoneService: Cornerstone3D initialized successfully');
          resolve();
        })
        .catch(error => {
          this.initializing = false;
          this.retryCount++;
          this.initError = error;
          console.error(`CornerstoneService: Failed to initialize Cornerstone3D (attempt ${this.retryCount}/${this.maxRetries})`, error);
          reject(error);
        });
    });
    
    return this.initPromise;
  }

  /**
   * Force a retry of initialization
   */
  async retryInitialization(): Promise<void> {
    // Reset initialization state
    this.initialized = false;
    this.initializing = false;
    this.initPromise = null;
    
    // Try again
    return this.initialize();
  }

  /**
   * Create or get a rendering engine for a specific view type
   * @param id Unique ID for the rendering engine
   * @param viewType Type of view (AXIAL, CORONAL, SAGITTAL, etc.)
   * @returns The rendering engine instance
   */
  async getRenderingEngine(id: string, viewType: string): Promise<RenderingEngine> {
    try {
      await this.initialize();
    } catch (error) {
      console.error('CornerstoneService: Could not initialize for rendering engine creation', error);
      throw new Error(`Failed to initialize Cornerstone3D before creating rendering engine: ${error}`);
    }
    
    if (this.renderingEngines[id]) {
      this.renderingEngines[id].refCount++;
      console.log(`CornerstoneService: Reusing rendering engine ${id}, refCount: ${this.renderingEngines[id].refCount}`);
      return this.renderingEngines[id].engine;
    }
    
    const engine = await createRenderingEngine(id);
    this.renderingEngines[id] = {
      engine,
      refCount: 1,
      viewType
    };
    
    console.log(`CornerstoneService: Created new rendering engine ${id} for ${viewType} view`);
    return engine;
  }

  /**
   * Release a rendering engine
   * @param id ID of the rendering engine to release
   * @param force Force destruction even if refCount > 0
   */
  releaseRenderingEngine(id: string, force = false): void {
    if (!this.renderingEngines[id]) {
      console.warn(`CornerstoneService: Cannot release non-existent rendering engine ${id}`);
      return;
    }
    
    this.renderingEngines[id].refCount--;
    console.log(`CornerstoneService: Released rendering engine ${id}, refCount: ${this.renderingEngines[id].refCount}`);
    
    if (this.renderingEngines[id].refCount <= 0 || force) {
      console.log(`CornerstoneService: Destroying rendering engine ${id}`);
      cleanupCornerstone3D(id, []);
      delete this.renderingEngines[id];
    }
  }

  /**
   * Check if a rendering engine exists
   * @param id ID of the rendering engine to check
   * @returns true if the rendering engine exists
   */
  hasRenderingEngine(id: string): boolean {
    return !!this.renderingEngines[id];
  }

  /**
   * Validate image IDs by checking if they can be loaded
   * @param imageIds Array of image IDs to validate
   * @returns Validation result
   */
  async validateImages(imageIds: string[]) {
    try {
      await this.initialize();
      return validateImageIds(imageIds);
    } catch (error: any) {
      console.error('Failed to validate images due to initialization error:', error);
      return {
        valid: false,
        issues: [`Cornerstone3D initialization failed: ${error.message || String(error)}`],
      };
    }
  }
}

// Export a singleton instance
export const cornerstoneService = new CornerstoneService(); 