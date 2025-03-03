import { init as csRenderInit } from "@cornerstonejs/core";
import { init as csToolsInit } from "@cornerstonejs/tools";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";
import {
  addTool,
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  BrushTool,
  SegmentationDisplayTool,
  RectangleROITool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  ProbeTool,
} from "@cornerstonejs/tools";

export class CornerstoneService {
  private static instance: CornerstoneService;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): CornerstoneService {
    if (!CornerstoneService.instance) {
      CornerstoneService.instance = new CornerstoneService();
    }
    return CornerstoneService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('Initializing Cornerstone3D...');
      
      // Initialize Cornerstone Core
      await csRenderInit();
      console.log('Cornerstone Core initialized');

      // Initialize Cornerstone Tools
      await csToolsInit();
      console.log('Cornerstone Tools initialized');

      // Initialize DICOM Image Loader
      await this.initializeImageLoader();
      console.log('DICOM Image Loader initialized');

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

  private async initializeImageLoader(): Promise<void> {
    dicomImageLoaderInit({
      maxWebWorkers: navigator.hardwareConcurrency || 4,
      strict: false,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true,
      },
    });
  }

  private async registerTools(): Promise<void> {
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
    addTool(SegmentationDisplayTool);
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