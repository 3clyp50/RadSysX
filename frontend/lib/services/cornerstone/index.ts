'use client';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Import types only during type checking
import type { Types } from "@cornerstonejs/core";

// Interface for DICOM image loader configuration
interface ImageLoaderConfig {
  useWebWorkers: boolean;
  decodeConfig: {
    convertFloatPixelDataToInt: boolean;
    use16BitDataType: boolean;
  };
  strict: boolean;
}

// Create a mock service for server-side rendering
const createMockService = () => ({
  initialize: async () => {},
  addTool: () => {},
  isInitialized: () => false,
  ensureInitialized: async () => {},
});

// Only import Cornerstone modules in browser environment
let csRenderInit: any;
let csToolsInit: any;
let dicomImageLoader: any;
let cornerstoneTools: any;
let tools: any;
let dicomParser: any;
let imageLoader: any;

if (typeof window !== 'undefined') {
  // Dynamic imports for browser environment
  Promise.all([
    import("@cornerstonejs/core").then(mod => { 
      csRenderInit = mod.init; 
      imageLoader = mod.imageLoader;
    }),
    import("@cornerstonejs/tools").then(mod => {
      csToolsInit = mod.init;
      cornerstoneTools = mod;
      tools = {
        addTool: mod.addTool,
        PanTool: mod.PanTool,
        WindowLevelTool: mod.WindowLevelTool,
        StackScrollTool: mod.StackScrollTool,
        ZoomTool: mod.ZoomTool,
        BrushTool: mod.BrushTool,
        RectangleROITool: mod.RectangleROITool,
        LengthTool: mod.LengthTool,
        AngleTool: mod.AngleTool,
        EllipticalROITool: mod.EllipticalROITool,
        CircleROITool: mod.CircleROITool,
        BidirectionalTool: mod.BidirectionalTool,
        ProbeTool: mod.ProbeTool,
      };
    }),
    import("@cornerstonejs/dicom-image-loader").then(mod => { 
      dicomImageLoader = mod.default;
    }),
    import("dicom-parser").then(mod => {
      dicomParser = mod.default;
    })
  ]).catch(error => {
    console.error('Error loading Cornerstone modules:', error);
  });
}

export class CornerstoneService {
  private static instance: CornerstoneService;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    if (typeof window === 'undefined') {
      return;
    }
  }

  static getInstance(): CornerstoneService {
    if (typeof window === 'undefined') {
      return createMockService() as unknown as CornerstoneService;
    }

    if (!CornerstoneService.instance) {
      CornerstoneService.instance = new CornerstoneService();
    }
    return CornerstoneService.instance;
  }

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      console.log('Initializing Cornerstone3D...');
      
      // Wait for modules to be loaded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!csRenderInit || !csToolsInit || !dicomImageLoader || !imageLoader) {
        throw new Error('Cornerstone modules not loaded');
      }

      // Initialize DICOM image loader first
      if (dicomImageLoader) {
        console.log('Configuring DICOM image loader...');
        
        // Set external dependencies
        dicomImageLoader.external = {
          cornerstone: csRenderInit,
          dicomParser: dicomParser
        };

        // Configure the image loader with proper settings
        const imageLoaderConfig: ImageLoaderConfig = {
          useWebWorkers: true,
          decodeConfig: {
            convertFloatPixelDataToInt: false,
            use16BitDataType: true,
          },
          strict: false
        };

        // Try both configuration methods
        try {
          if (typeof dicomImageLoader.configure === 'function') {
            dicomImageLoader.configure(imageLoaderConfig);
            console.log('DICOM image loader configured via configure()');
          }
        } catch (configError) {
          console.warn('Failed to configure via configure(), trying webWorkerManager:', configError);
        }

        // Initialize web workers
        try {
          await dicomImageLoader.webWorkerManager.initialize({
            maxWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 4),
            startWebWorkersOnDemand: true,
            taskConfiguration: {
              decodeTask: {
                initializeCodecsOnStartup: true,
                strict: false
              },
            },
          });
          console.log('Web workers initialized successfully');
        } catch (workerError) {
          console.error('Failed to initialize web workers:', workerError);
          // Continue anyway as web workers are optional
        }

        // Register image loaders
        if (dicomImageLoader.wadouri) {
          imageLoader.registerImageLoader('wadouri', dicomImageLoader.wadouri.loadImage);
          imageLoader.registerImageLoader('wadors', dicomImageLoader.wadors.loadImage);
          console.log('DICOM image loaders registered');
        }
      }

      // Initialize Cornerstone Core
      await csRenderInit();
      console.log('Cornerstone Core initialized');

      // Initialize Cornerstone Tools
      await csToolsInit();
      console.log('Cornerstone Tools initialized');

      // Register all tools
      await this.registerTools();
      console.log('Tools registered');

      this.initialized = true;
      console.log('Cornerstone3D initialization complete');
    } catch (error) {
      console.error('Error initializing Cornerstone3D:', error);
      this.initialized = false;
      this.initializationPromise = null;
      throw error;
    }
  }

  private async registerTools(): Promise<void> {
    if (!isBrowser || !tools) {
      return;
    }

    const {
      addTool,
      LengthTool,
      AngleTool,
      RectangleROITool,
      EllipticalROITool,
      CircleROITool,
      BidirectionalTool,
      ProbeTool,
      PanTool,
      WindowLevelTool,
      StackScrollTool,
      ZoomTool,
      BrushTool,
    } = tools;

    // Annotation Tools
    addTool(LengthTool);
    addTool(AngleTool);
    addTool(RectangleROITool);
    addTool(EllipticalROITool);
    addTool(CircleROITool);
    addTool(BidirectionalTool);
    addTool(ProbeTool);

    // Manipulation Tools
    addTool(PanTool);
    addTool(WindowLevelTool);
    addTool(StackScrollTool);
    addTool(ZoomTool);

    // Segmentation Tools
    addTool(BrushTool);
    console.log('Segmentation module loaded');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export a singleton instance
export const cornerstoneService = CornerstoneService.getInstance();

// Export types
export type { Types } from "@cornerstonejs/core";
export { Enums } from "@cornerstonejs/core";
export { ToolGroupManager } from "@cornerstonejs/tools"; 