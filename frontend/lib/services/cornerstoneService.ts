// Add browser environment check
const isBrowser = typeof window !== 'undefined';

// Import types
import type { Types } from '@cornerstonejs/core';

// Define ImageLoaderConfig interface
interface ImageLoaderConfig {
  useWebWorkers: boolean;
  decodeConfig: {
    convertFloatPixelDataToInt: boolean;
    use16BitDataType: boolean;
  };
  strict: boolean;
}

// Track rendering engines by ID
interface RenderingEngineTracker {
  [key: string]: any;
}

// Define viewport type
interface Viewport {
  id: string;
  hasBeenDestroyed?: boolean;
}

// Add type definitions at the top of the file
interface DicomImageLoaderModule {
  init: (options?: {
    maxWebWorkers?: number;
    startWebWorkersOnDemand?: boolean;
    taskConfiguration?: {
      decodeTask?: {
        initializeCodecsOnStartup?: boolean;
        strict?: boolean;
        useWebAssembly?: boolean;
      };
    };
  }) => void;
  wadouri?: {
    loadImage: (imageId: string) => { promise: Promise<unknown> };
  };
  wadors?: {
    loadImage: (imageId: string) => { promise: Promise<unknown> };
  };
}

interface CornerstoneModules {
  core: any;
  tools: any;
  imageLoader: DicomImageLoaderModule;
  parser: any;
}

// Track initialization state
interface InitializationState {
  isInitializing: boolean;
  isInitialized: boolean;
  error: Error | null;
  initPromise: Promise<void> | null;
}

// Singleton state tracker
const initState: InitializationState = {
  isInitializing: false,
  isInitialized: false,
  error: null,
  initPromise: null
};

// Base class for both real and mock services
abstract class CornerstoneServiceBase {
  protected initialized = false;
  protected initializationPromise: Promise<void> | null = null;
  protected renderingEngines: RenderingEngineTracker = {};
  protected tools: any = {};
  protected core: any = null;
  protected imageLoader: any = null;

  // Module references - these will be loaded once and cached
  protected static modules: CornerstoneModules;

  abstract initialize(): Promise<void>;
  abstract getRenderingEngine(id: string, viewType: string): Promise<any>;
  abstract releaseRenderingEngine(id: string, force?: boolean): Promise<void>;
  abstract hasRenderingEngine(id: string): boolean;
  abstract validateImages(imageIds: string[]): Promise<{ valid: boolean; validatedIds: string[]; issues: string[] }>;
  abstract loadAndDisplayImageStack(
    element: HTMLDivElement,
    imageIds: string[],
    renderingEngineId: string,
    viewportId: string
  ): Promise<{ viewport: Types.IStackViewport | null; renderingEngine: any }>;
  abstract loadAndDisplayVolume(
    element: HTMLDivElement,
    imageIds: string[],
    renderingEngineId: string,
    viewportId: string
  ): Promise<any>;
  abstract is2DImage(imageId: string): Promise<boolean>;

  // Add isInitialized method
  isInitialized(): boolean {
    return this.initialized;
  }

  // Add ensureInitialized method
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  protected async loadModules(): Promise<void> {
    if (!isBrowser) return;

    try {
      // Load all modules in parallel but wait for all to complete
      const [core, tools, parser] = await Promise.all([
        import('@cornerstonejs/core'),
        import('@cornerstonejs/tools'),
        import('dicom-parser')
      ]);

      // Import DICOM image loader
      const imageLoader = await import('@cornerstonejs/dicom-image-loader');

      if (!imageLoader.default || typeof imageLoader.default.init !== 'function') {
        throw new Error('Failed to load DICOM image loader module');
      }

      // Initialize the DICOM image loader
      await imageLoader.default.init();

      // Register the WADO-URI and WADO-RS image loaders
      if (imageLoader.default.wadouri) {
        core.imageLoader.registerImageLoader('wadouri', imageLoader.default.wadouri.loadImage as any);
        // Register WADO-URI metadata provider
        core.metaData.addProvider((imageLoader.default.wadouri as any).metaDataProvider);
        console.log('WADOURI image loader and metadata provider registered');
      }
      
      if (imageLoader.default.wadors) {
        core.imageLoader.registerImageLoader('wadors', imageLoader.default.wadors.loadImage as any);
        // Register WADO-RS metadata provider
        core.metaData.addProvider((imageLoader.default.wadors as any).metaDataProvider);
        console.log('WADORS image loader and metadata provider registered');
      }

      // Store modules
      CornerstoneServiceBase.modules = {
        core,
        tools,
        imageLoader: imageLoader.default,
        parser: parser.default
      };

      // Store instance properties
      this.core = core;
      this.tools = tools;
      this.imageLoader = imageLoader.default;

      console.log('Cornerstone modules loaded:', {
        core: !!core,
        tools: !!tools,
        imageLoader: !!imageLoader,
        parser: !!parser
      });
    } catch (error) {
      console.error('Failed to load Cornerstone modules:', error);
      throw error;
    }
  }

  protected async registerTools(): Promise<void> {
    if (!isBrowser) return;

    const { tools } = CornerstoneServiceBase.modules;
    
    this.tools = {
      PanTool: tools.PanTool,
      WindowLevelTool: tools.WindowLevelTool,
      StackScrollTool: tools.StackScrollTool,
      ZoomTool: tools.ZoomTool,
      BrushTool: tools.BrushTool,
      RectangleROITool: tools.RectangleROITool,
      LengthTool: tools.LengthTool,
      AngleTool: tools.AngleTool,
      EllipticalROITool: tools.EllipticalROITool,
      CircleROITool: tools.CircleROITool,
      BidirectionalTool: tools.BidirectionalTool,
      ProbeTool: tools.ProbeTool,
    };

    // Register each tool
    Object.entries(this.tools).forEach(([name, Tool]) => {
      if (Tool) {
        tools.addTool(Tool);
      }
    });
  }
}

// Create a mock service for server-side rendering
class MockCornerstoneService extends CornerstoneServiceBase {
  async initialize(): Promise<void> {}
  async getRenderingEngine(): Promise<null> { return null; }
  async releaseRenderingEngine(): Promise<void> {}
  hasRenderingEngine(): boolean { return false; }
  async validateImages() { return { valid: false, validatedIds: [], issues: ['Server-side rendering'] }; }
  async loadAndDisplayImageStack() { return { viewport: null, renderingEngine: null }; }
  async loadAndDisplayVolume() { return null; }
  async is2DImage() { return true; }
}

// Real implementation
class CornerstoneService extends CornerstoneServiceBase {
  private static instance: CornerstoneService | null = null;

  protected constructor() {
    super();
  }

  static getInstance(): CornerstoneServiceBase {
    if (!isBrowser) {
      return new MockCornerstoneService();
    }
    
    if (!CornerstoneService.instance) {
      CornerstoneService.instance = new CornerstoneService();
    }
    return CornerstoneService.instance;
  }

  async initialize(): Promise<void> {
    if (!isBrowser) {
      throw new Error('CornerstoneService cannot be initialized in server environment');
    }

    // Return existing initialization if complete
    if (this.initialized) {
      return;
    }

    // Return existing promise if initialization is in progress
    if (initState.initPromise) {
      return initState.initPromise;
    }

    // Start new initialization
    initState.isInitializing = true;
    initState.initPromise = this._initialize();

    try {
      await initState.initPromise;
      initState.isInitialized = true;
      this.initialized = true;
    } catch (error) {
      initState.error = error as Error;
      throw error;
    } finally {
      initState.isInitializing = false;
    }

    return initState.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('Initializing Cornerstone3D...');
      
      // Load all modules first
      await this.loadModules();
      
      const { core, tools, imageLoader, parser } = CornerstoneServiceBase.modules;
      
      if (!core || !tools || !imageLoader || !parser) {
        throw new Error('Failed to load required Cornerstone modules');
      }

      // Initialize core and tools first
      await core.init();
      await tools.init();
      
      // Register tools
      await this.registerTools();

      // Store the core imageLoader for later use
      this.imageLoader = core.imageLoader;

      console.log('Cornerstone3D initialization complete');
    } catch (error) {
      console.error('Error in Cornerstone3D initialization:', error);
      throw error;
    }
  }

  async getRenderingEngine(id: string, viewType: string): Promise<any> {
    await this.initialize();
    
    // Check if we already have this rendering engine
    if (this.renderingEngines[id]) {
      console.log(`CornerstoneService: Using existing rendering engine ${id}`);
      return this.renderingEngines[id];
    }
    
    try {
      console.log(`CornerstoneService: Creating new rendering engine ${id}`);
      // If the rendering engine with this ID already exists in Cornerstone,
      // we need to destroy it first to prevent conflicts
      const existingEngine = this.core.getRenderingEngine(id);
      if (existingEngine) {
        console.log(`CornerstoneService: Found existing Cornerstone engine with ID ${id}, destroying it first`);
        existingEngine.destroy();
      }
      
      // Create a new rendering engine
      const renderingEngine = new this.core.RenderingEngine(id);
      this.renderingEngines[id] = renderingEngine;
      return renderingEngine;
    } catch (error) {
      console.error(`CornerstoneService: Failed to create rendering engine ${id}:`, error);
      throw error;
    }
  }

  async releaseRenderingEngine(id: string, force: boolean = false): Promise<void> {
    try {
      const engine = this.renderingEngines[id] || this.core.getRenderingEngine(id);
      
      if (engine) {
        // Clean up tool groups associated with this engine
        try {
          // Get all viewports from the engine
          const viewports = engine.getViewports();
          
          // For each viewport, check and destroy its tool group
          viewports.forEach((viewport: Viewport) => {
            const viewportId = viewport.id;
            const toolGroup = this.tools.ToolGroupManager.getToolGroup(viewportId);
            if (toolGroup) {
              this.tools.ToolGroupManager.destroyToolGroup(viewportId);
            }
          });
        } catch (error) {
          console.warn(`Failed to clean up tool groups for engine ${id}:`, error);
        }

        try {
          if (!engine.hasBeenDestroyed) {
            engine.destroy();
          }
        } catch (error) {
          console.warn(`Failed to destroy engine ${id}:`, error);
        }

        delete this.renderingEngines[id];
      } else if (!force) {
        console.warn(`CornerstoneService: Cannot release non-existent rendering engine ${id}`);
      }
    } catch (error) {
      console.error(`CornerstoneService: Error releasing rendering engine ${id}:`, error);
      if (!force) {
        throw error;
      }
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
      if (!imageIds || imageIds.length === 0) {
        return {
          valid: false,
          validatedIds: [],
          issues: ['No image IDs provided']
        };
      }

      // Validate metadata for each image
      const validationResults = await Promise.all(
        imageIds.map(async (imageId) => {
          try {
            // Try to load the image metadata using the imageLoader
            const imageLoadObject = await this.imageLoader.loadAndCacheImage(imageId);
            
            if (!imageLoadObject) {
              return {
                imageId,
                valid: false,
                issues: ['Failed to load image']
              };
            }

            // First check if this is a regular 2D image (non-DICOM)
            const is2DImage = imageId.startsWith('data:image/') || 
                            imageId.endsWith('.png') || 
                            imageId.endsWith('.jpg') || 
                            imageId.endsWith('.jpeg');

            if (is2DImage) {
              // For 2D images, we only need basic metadata
              const basicMetadata = {
                rows: this.core.metaData.get('rows', imageId),
                columns: this.core.metaData.get('columns', imageId),
              };

              // Log metadata for debugging
              console.log(`Basic metadata for 2D image ${imageId}:`, basicMetadata);

              // Check if basic fields are present
              if (!basicMetadata.rows || !basicMetadata.columns) {
                return {
                  imageId,
                  valid: false,
                  issues: ['Missing basic image dimensions']
                };
              }

              return {
                imageId,
                valid: true,
                issues: []
              };
            }

            // For DICOM images, check all required metadata fields
            const metadata = {
              samplesPerPixel: this.core.metaData.get('samplesPerPixel', imageId),
              photometricInterpretation: this.core.metaData.get('photometricInterpretation', imageId),
              rows: this.core.metaData.get('rows', imageId),
              columns: this.core.metaData.get('columns', imageId),
              bitsAllocated: this.core.metaData.get('bitsAllocated', imageId),
              bitsStored: this.core.metaData.get('bitsStored', imageId),
              pixelRepresentation: this.core.metaData.get('pixelRepresentation', imageId)
            };

            // Log metadata for debugging
            console.log(`DICOM metadata for ${imageId}:`, metadata);

            // Check if any required fields are missing
            const missingFields = Object.entries(metadata)
              .filter(([_, value]) => value === undefined)
              .map(([key]) => key);

            if (missingFields.length > 0) {
              return {
                imageId,
                valid: false,
                issues: [`Missing required metadata: ${missingFields.join(', ')}`]
              };
            }

            return {
              imageId,
              valid: true,
              issues: []
            };
          } catch (error) {
            console.error(`Error validating image ${imageId}:`, error);
            return {
              imageId,
              valid: false,
              issues: [error instanceof Error ? error.message : 'Unknown error validating image']
            };
          }
        })
      );

      // Aggregate results
      const validIds = validationResults
        .filter(result => result.valid)
        .map(result => result.imageId);

      const allIssues = validationResults
        .filter(result => !result.valid)
        .map(result => `${result.imageId}: ${result.issues.join(', ')}`);

      return {
        valid: validIds.length === imageIds.length,
        validatedIds: validIds,
        issues: allIssues
      };
    } catch (error: any) {
      console.error('Failed to validate images due to initialization error:', error);
      return {
        valid: false,
        validatedIds: [],
        issues: [`Cornerstone3D initialization failed: ${error.message || String(error)}`]
      };
    }
  }

  async loadAndDisplayImageStack(
    element: HTMLDivElement,
    imageIds: string[],
    renderingEngineId: string,
    viewportId: string
  ) {
    try {
      console.log(`CornerstoneService: Loading image stack for viewport ${viewportId}`, { imageIds });
      await this.initialize();

      // Validate images first
      const validation = await this.validateImages(imageIds);
      if (!validation.valid) {
        throw new Error(`Invalid images: ${validation.issues.join(', ')}`);
      }
      
      // Get or create rendering engine
      const renderingEngine = await this.getRenderingEngine(renderingEngineId, 'STACK');
      
      // Define the viewport input
      const viewportInput: Types.PublicViewportInput = {
        viewportId,
        element,
        type: this.core.Enums.ViewportType.STACK,
      };
      
      // Create the viewport
      renderingEngine.enableElement(viewportInput);
      const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;

      if (!viewport) {
        throw new Error('Failed to create viewport');
      }

      // Load the stack
      console.log(`CornerstoneService: Setting stack for viewport ${viewportId} with ${imageIds.length} images`);
      await viewport.setStack(imageIds);
      
      // Render the viewport
      viewport.render();
      console.log(`CornerstoneService: Successfully loaded and rendered stack for viewport ${viewportId}`);

      return { viewport, renderingEngine };
    } catch (error) {
      console.error(`CornerstoneService: Failed to load image stack for viewport ${viewportId}:`, error);
      throw error;
    }
  }

  async loadAndDisplayVolume(
    element: HTMLDivElement,
    imageIds: string[],
    renderingEngineId: string,
    viewportId: string
  ) {
    try {
      console.log(`CornerstoneService: Loading volume for viewport ${viewportId} with ${imageIds.length} images`);
      await this.initialize();
      
      // Safety check - need minimum 3 images
      if (!imageIds || imageIds.length < 3) {
        console.error('CornerstoneService: Cannot load volume with fewer than 3 images');
        throw new Error('Cannot load volume with fewer than 3 images');
      }
      
      // Pre-load the first image to ensure metadata is accessible for volume determination
      await this.imageLoader.loadAndCacheImage(imageIds[0]);
      
      // Get metadata to validate we have what's needed for volume loading
      const imageSpacing = this.core.metaData.get('imagePixelSpacing', imageIds[0]) || 
                          this.core.metaData.get('pixelSpacing', imageIds[0]);
      const imageOrientation = this.core.metaData.get('imageOrientationPatient', imageIds[0]);
      const imagePosition = this.core.metaData.get('imagePositionPatient', imageIds[0]);
      const sliceThickness = this.core.metaData.get('sliceThickness', imageIds[0]);
      
      // Validate we have the required metadata
      const hasRequiredMetadata = !!imageSpacing && !!imageOrientation && !!imagePosition && !!sliceThickness;
      if (!hasRequiredMetadata) {
        console.error('CornerstoneService: Missing required metadata for volume loading', {
          hasSpacing: !!imageSpacing, 
          hasOrientation: !!imageOrientation, 
          hasPosition: !!imagePosition,
          hasThickness: !!sliceThickness
        });
        throw new Error('Missing required metadata for volume loading');
      }
      
      // Get or create rendering engine
      const renderingEngine = await this.getRenderingEngine(renderingEngineId, 'VOLUME');
      
      // Define the viewport input
      const viewportInput: Types.PublicViewportInput = {
        viewportId,
        element,
        type: this.core.Enums.ViewportType.ORTHOGRAPHIC,
        defaultOptions: {
          background: [0, 0, 0],
          orientation: this.core.Enums.OrientationAxis.AXIAL
        }
      };
      
      // Setup the viewport
      renderingEngine.enableElement(viewportInput);
      
      // Get the viewport
      const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
      
      try {
        // Create a unique volume ID
        const volumeId = `volume-${Date.now()}`;
        
        // Create and cache the volume
        const volume = await this.core.volumeLoader.createAndCacheVolume(volumeId, {
          imageIds
        });
        
        // Set the volume to load
        await viewport.setVolumes([
          { 
            volumeId,
            callback: ({ volumeActor }: { volumeActor: Types.VolumeActor }) => {
              console.log(`Volume actor created for ${volumeId}`);
              return volumeActor;
            }
          }
        ]);
        
        // Load the volume in the viewport
        await volume.load();
        
        // Render the scene
        viewport.render();
        
        console.log(`CornerstoneService: Successfully loaded and rendered volume for viewport ${viewportId}`);
        
        return volume;
      } catch (volumeError) {
        console.error(`CornerstoneService: Error creating or setting volume:`, volumeError);
        throw volumeError;
      }
    } catch (error) {
      console.error(`CornerstoneService: Failed to load and display volume for viewport ${viewportId}:`, error);
      throw error;
    }
  }

  async is2DImage(imageId: string): Promise<boolean> {
    await this.initialize();
    
    try {
      // Load the image to ensure metadata is available
      await this.imageLoader.loadAndCacheImage(imageId);
      
      // Get all available metadata for this image to diagnose issues
      const allMetadata = {
        imagePixelSpacing: this.core.metaData.get('imagePixelSpacing', imageId),
        pixelSpacing: this.core.metaData.get('pixelSpacing', imageId),
        imageOrientation: this.core.metaData.get('imageOrientationPatient', imageId),
        imagePosition: this.core.metaData.get('imagePositionPatient', imageId),
        sliceThickness: this.core.metaData.get('sliceThickness', imageId),
        sliceLocation: this.core.metaData.get('sliceLocation', imageId),
        rows: this.core.metaData.get('rows', imageId),
        columns: this.core.metaData.get('columns', imageId),
        seriesInstanceUID: this.core.metaData.get('seriesInstanceUID', imageId),
      };

      console.log(`DICOM metadata for ${imageId}:`, allMetadata);
      
      // More comprehensive check for 3D metadata
      const imageSpacing = allMetadata.imagePixelSpacing || allMetadata.pixelSpacing;
      const imageOrientation = allMetadata.imageOrientation;
      const imagePosition = allMetadata.imagePosition;
      const sliceThickness = allMetadata.sliceThickness;
      
      // Log the values to help with debugging
      console.log(`Image ${imageId} 3D checks:`, {
        hasSpacing: !!imageSpacing, 
        hasOrientation: !!imageOrientation, 
        hasPosition: !!imagePosition,
        hasThickness: !!sliceThickness
      });
      
      // Check if any of these are missing, assume it's a 2D image then
      const lacks3DMetadata = !imageSpacing || !imageOrientation || !imagePosition || !sliceThickness;
      
      return lacks3DMetadata;
    } catch (error) {
      console.error('Error checking if image is 2D:', error);
      return true; // Default to 2D on error
    }
  }
}

// Export a singleton instance
export const cornerstoneService = CornerstoneService.getInstance();

// Export initialization state checker
export const getCornerstoneInitState = () => ({
  isInitializing: initState.isInitializing,
  isInitialized: initState.isInitialized,
  error: initState.error
});

// Export types
export type { Types } from "@cornerstonejs/core";
export { Enums } from "@cornerstonejs/core";
export { ToolGroupManager } from "@cornerstonejs/tools"; 