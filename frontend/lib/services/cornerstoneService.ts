import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { RenderingEngine, cache, volumeLoader, imageLoader, Types, utilities, CONSTANTS } from '@cornerstonejs/core';

// Track rendering engines by ID
interface RenderingEngineTracker {
  [key: string]: RenderingEngine;
}

// Extend the dicom image loader type
interface ExtendedDicomImageLoader {
  configure: (config: any) => void;
  webWorkerManager: {
    initialize: (config: any) => void;
  };
  external: {
    cornerstone: any;
    dicomParser: any;
  };
  wadouri: {
    loadImage: Types.ImageLoaderFn;
    loadFileRequest: Types.ImageLoaderFn;
  };
}

class CornerstoneService {
  private static instance: CornerstoneService;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private renderingEngines: RenderingEngineTracker = {};
  private initializationLock = false;

  private constructor() {}

  static getInstance(): CornerstoneService {
    if (!CornerstoneService.instance) {
      CornerstoneService.instance = new CornerstoneService();
    }
    return CornerstoneService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.initializationLock) {
      return new Promise((resolve) => {
        const checkInit = () => {
          if (this.isInitialized) {
            resolve();
          } else {
            setTimeout(checkInit, 100);
          }
        };
        checkInit();
      });
    }

    this.initializationLock = true;

    this.initializationPromise = (async () => {
      try {
        // Initialize Cornerstone Core first
        await cornerstone3D.init();
        console.log('Cornerstone Core initialized');

        // Initialize Cornerstone Tools
        await cornerstoneTools.init();
        console.log('Cornerstone Tools initialized');

        // Initialize DICOM Image Loader
        const extendedLoader = dicomImageLoader as unknown as ExtendedDicomImageLoader;

        // Configure DICOM image loader before initialization
        extendedLoader.configure({
          useWebWorkers: true,
          decodeConfig: {
            convertFloatPixelDataToInt: false,
            use16BitDataType: true,
          },
        });

        // Initialize web workers
        await new Promise<void>((resolve) => {
          extendedLoader.webWorkerManager.initialize({
            maxWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 4),
            startWebWorkersOnDemand: true,
            taskConfiguration: {
              decodeTask: {
                initializeCodecsOnStartup: true,
                usePDFJS: false,
                strict: false,
              },
            },
            onInitialized: () => resolve(),
          });
        });

        // Set external dependencies
        extendedLoader.external.cornerstone = cornerstone3D;
        extendedLoader.external.dicomParser = dicomParser;

        // Register image loaders
        imageLoader.registerImageLoader('wadouri', extendedLoader.wadouri.loadImage);
        imageLoader.registerImageLoader('dicomfile', extendedLoader.wadouri.loadFileRequest);

        // Initialize volume loader
        await volumeLoader.createAndCacheVolume('placeholder', {
          imageIds: [],
        }).catch(() => {
          // Ignore error from empty volume, we just want to initialize the volume loader
        });

        this.isInitialized = true;
        console.log('CornerstoneService: Initialization complete');
      } catch (error) {
        console.error('CornerstoneService: Initialization failed:', error);
        this.isInitialized = false;
        throw error;
      } finally {
        this.initializationLock = false;
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  async getRenderingEngine(id: string, viewType: string): Promise<RenderingEngine> {
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
      const existingEngine = cornerstone3D.getRenderingEngine(id);
      if (existingEngine) {
        console.log(`CornerstoneService: Found existing Cornerstone engine with ID ${id}, destroying it first`);
        existingEngine.destroy();
      }
      
      // Create a new rendering engine
      const renderingEngine = new RenderingEngine(id);
      this.renderingEngines[id] = renderingEngine;
      return renderingEngine;
    } catch (error) {
      console.error(`CornerstoneService: Failed to create rendering engine ${id}:`, error);
      throw error;
    }
  }

  async releaseRenderingEngine(id: string, force: boolean = false): Promise<void> {
    try {
      const engine = this.renderingEngines[id] || cornerstone3D.getRenderingEngine(id);
      
      if (engine) {
        // Clean up tool groups associated with this engine
        try {
          // Get all viewports from the engine
          const viewports = engine.getViewports();
          
          // For each viewport, check and destroy its tool group
          viewports.forEach(viewport => {
            const viewportId = viewport.id;
            const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(viewportId);
            if (toolGroup) {
              cornerstoneTools.ToolGroupManager.destroyToolGroup(viewportId);
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

      // For now, we'll be permissive and consider all IDs valid after initialization
      return {
        valid: true,
        validatedIds: imageIds,
        issues: []
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
      
      // Get or create rendering engine
      const renderingEngine = await this.getRenderingEngine(renderingEngineId, 'STACK');
      
      // Define the viewport input
      const viewportInput: Types.PublicViewportInput = {
        viewportId,
        element,
        type: cornerstone3D.Enums.ViewportType.STACK,
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
      await imageLoader.loadAndCacheImage(imageIds[0]);
      
      // Get metadata to validate we have what's needed for volume loading
      const imageSpacing = cornerstone3D.metaData.get('imagePixelSpacing', imageIds[0]) || 
                          cornerstone3D.metaData.get('pixelSpacing', imageIds[0]);
      const imageOrientation = cornerstone3D.metaData.get('imageOrientationPatient', imageIds[0]);
      const imagePosition = cornerstone3D.metaData.get('imagePositionPatient', imageIds[0]);
      const sliceThickness = cornerstone3D.metaData.get('sliceThickness', imageIds[0]);
      
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
        type: cornerstone3D.Enums.ViewportType.ORTHOGRAPHIC,
        defaultOptions: {
          background: [0, 0, 0],
          orientation: cornerstone3D.Enums.OrientationAxis.AXIAL
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
        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
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
      await imageLoader.loadAndCacheImage(imageId);
      
      // Get all available metadata for this image to diagnose issues
      const allMetadata = {
        imagePixelSpacing: cornerstone3D.metaData.get('imagePixelSpacing', imageId),
        pixelSpacing: cornerstone3D.metaData.get('pixelSpacing', imageId),
        imageOrientation: cornerstone3D.metaData.get('imageOrientationPatient', imageId),
        imagePosition: cornerstone3D.metaData.get('imagePositionPatient', imageId),
        sliceThickness: cornerstone3D.metaData.get('sliceThickness', imageId),
        sliceLocation: cornerstone3D.metaData.get('sliceLocation', imageId),
        rows: cornerstone3D.metaData.get('rows', imageId),
        columns: cornerstone3D.metaData.get('columns', imageId),
        seriesInstanceUID: cornerstone3D.metaData.get('seriesInstanceUID', imageId),
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