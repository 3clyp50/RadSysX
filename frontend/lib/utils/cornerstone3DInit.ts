'use client';

// Cornerstone3D Initialization Module

// Core libraries
import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import dicomParser from 'dicom-parser';
import { cornerstoneService } from '@/lib/services/cornerstoneService';
import type { Types } from '@cornerstonejs/core';
import { metaData } from '@cornerstonejs/core';

// Cornerstone3D core modules
const {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  imageLoader,
  cache,
  utilities
} = cornerstone3D;

// Cornerstone3D tools modules
const { 
  ToolGroupManager,
  Enums: ToolEnums,
  segmentation,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  AngleTool,
  ProbeTool,
  BrushTool,
  StackScrollTool,
  MagnifyTool,
  CrosshairsTool,
  CircleROITool
} = cornerstoneTools;

// Define custom tool types
export type UiToolType = 
  | 'pan'
  | 'zoom'
  | 'windowLevel'
  | 'stackScroll'
  | 'length'
  | 'angle'
  | 'rectangleROI'
  | 'ellipticalROI'
  | 'circleROI'
  | 'bidirectional'
  | 'probe'
  | 'brush'
  | 'eraser'
  | 'magnify'
  | 'crosshairs';

// Define types for DICOM image loader
interface DicomImageLoaderModule {
  external?: {
    cornerstone?: any;
    dicomParser?: any;
  };
  configure?: (config: any) => void;
  webWorkerManager?: {
    initialize: (config: any) => Promise<void>;
  };
  wadouri?: {
    loadImage: any;
  };
  wadors?: {
    loadImage: any;
  };
}

/**
 * Initialize the Cornerstone3D libraries with proper error handling
 */
export async function initializeCornerstone3D(): Promise<void> {
  try {
    // Only initialize in browser environment
    if (typeof window === 'undefined') {
      console.log('Skipping Cornerstone3D initialization in SSR');
      return;
    }

    // Initialize Cornerstone Core first
    await cornerstone3D.init();
    console.log('Cornerstone Core initialized');

    // Initialize Cornerstone Tools
    await cornerstoneTools.init();
    console.log('Cornerstone Tools initialized');

    // Dynamically import DICOM image loader
    const dicomImageLoaderModule = await import('@cornerstonejs/dicom-image-loader');
    const loader = dicomImageLoaderModule.default as DicomImageLoaderModule;
    
    // Initialize DICOM image loader
    if (loader) {
      // Set external dependencies
      loader.external = loader.external || {};
      loader.external.cornerstone = cornerstone3D;
      loader.external.dicomParser = dicomParser;

      // Configure the image loader
      if (loader.configure) {
        loader.configure({
          useWebWorkers: true,
          decodeConfig: {
            convertFloatPixelDataToInt: false,
            use16BitDataType: true,
          },
          strict: false
        });
      }

      // Initialize web workers
      if (loader.webWorkerManager) {
        await loader.webWorkerManager.initialize({
          maxWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 4),
          startWebWorkersOnDemand: true,
          taskConfiguration: {
            decodeTask: {
              initializeCodecsOnStartup: true,
              strict: false
            },
          },
        });
      }

      // Register image loaders
      if (loader.wadouri) {
        cornerstone3D.imageLoader.registerImageLoader('wadouri', loader.wadouri.loadImage);
      }
      if (loader.wadors) {
        cornerstone3D.imageLoader.registerImageLoader('wadors', loader.wadors.loadImage);
      }
    }

    // Initialize the cornerstone service
    await cornerstoneService.initialize();

    console.log('Cornerstone3D initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Cornerstone3D:', error);
    throw error;
  }
}

/**
 * Creates a viewport in the given element with proper error handling
 */
export function createViewport(
  renderingEngine: any,
  elementId: string,
  viewportId: string,
  viewportType: cornerstone3D.Enums.ViewportType,
  options: any = {}
): any {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID ${elementId} not found`);
    }

    // Create the viewport with required properties
    const viewport = renderingEngine.enableElement({
      viewportId,
      type: viewportType,
      element: element as HTMLDivElement,
      defaultOptions: {
        background: [0, 0, 0],
        orientation: options.orientation || Enums.OrientationAxis.AXIAL,
        ...options
      }
    });

    return viewport;
  } catch (error) {
    console.error('Error creating viewport:', error);
    throw error;
  }
}

/**
 * Create a tool group for a set of viewports with enhanced error handling
 */
export function createToolGroup(
  toolGroupId: string,
  viewportIds: string[],
  renderingEngineId: string
): any {
  try {
    // Clean up existing tool group with the same ID
    const existingToolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (existingToolGroup) {
      ToolGroupManager.destroyToolGroup(toolGroupId);
    }

    // Create a new tool group
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    
    if (!toolGroup) {
      throw new Error(`Failed to create tool group: ${toolGroupId}`);
    }

    // Add tools to the tool group with default configurations
    const tools = [
      { name: PanTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: ZoomTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: WindowLevelTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: LengthTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: RectangleROITool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: EllipticalROITool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: CircleROITool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: AngleTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: ProbeTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: BrushTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: StackScrollTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: MagnifyTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: CrosshairsTool.toolName, mode: ToolEnums.ToolModes.Active },
      { name: "VolumeRotateMouseWheel", mode: ToolEnums.ToolModes.Active }
    ];

    tools.forEach(tool => {
      toolGroup.addTool(tool.name, { mode: tool.mode });
    });

    // Add viewports to the tool group
    viewportIds.forEach(viewportId => {
      toolGroup.addViewport(viewportId, renderingEngineId);
    });

    return toolGroup;
  } catch (error) {
    console.error('Error creating tool group:', error);
    throw error;
  }
}

/**
 * Map UI tool types to Cornerstone3D tool names
 */
export function mapUiToolToCornerstone3D(tool: UiToolType): string {
  const toolMap: Record<UiToolType, string> = {
    pan: 'Pan',
    zoom: 'Zoom',
    windowLevel: 'WindowLevel',
    stackScroll: 'StackScroll',
    length: 'Length',
    angle: 'Angle',
    rectangleROI: 'RectangleROI',
    ellipticalROI: 'EllipticalROI',
    circleROI: 'CircleROI',
    bidirectional: 'Bidirectional',
    probe: 'Probe',
    brush: 'Brush',
    eraser: 'Eraser',
    magnify: 'Magnify',
    crosshairs: 'Crosshairs'
  };

  return toolMap[tool] || 'Pan';
}

/**
 * Check if a series of images can be loaded as a volume
 */
export async function canLoadAsVolume(imageIds: string[]): Promise<boolean> {
  if (!imageIds || imageIds.length < 3) {
    return false;
  }

  try {
    // Ensure cornerstone is initialized
    await cornerstoneService.initialize();

    // Get metadata for the first image
    const metadata = metaData.get('imagePlaneModule', imageIds[0]);
    
    if (!metadata) {
      console.warn('No metadata found for image');
      return false;
    }

    // Check required metadata
    const hasRequiredMetadata = 
      metadata.imageOrientationPatient &&
      metadata.imagePositionPatient &&
      metadata.rowCosines &&
      metadata.columnCosines &&
      metadata.rowPixelSpacing &&
      metadata.columnPixelSpacing &&
      metadata.sliceThickness;

    if (!hasRequiredMetadata) {
      console.warn('Missing required metadata for volume loading');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking volume capability:', error);
    return false;
  }
}

/**
 * Clean up Cornerstone3D resources
 */
export async function cleanupCornerstone3D(renderingEngineId: string, toolGroupIds: string[] = []): Promise<void> {
  try {
    const [core, tools] = await Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools')
    ]);

    // Clean up tool groups
    for (const toolGroupId of toolGroupIds) {
      try {
        const toolGroup = tools.ToolGroupManager.getToolGroup(toolGroupId);
        if (toolGroup) {
          // Disable all tools before destroying
          const toolNames = Object.keys(toolGroup.toolOptions || {});
          for (const toolName of toolNames) {
            try {
              toolGroup.setToolDisabled(toolName);
            } catch (toolError) {
              console.warn(`Error disabling tool ${toolName}:`, toolError);
            }
          }
          tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        }
      } catch (toolError) {
        console.warn(`Error cleaning up tool group ${toolGroupId}:`, toolError);
      }
    }

    // Clean up rendering engine
    const renderingEngine = core.getRenderingEngine(renderingEngineId);
    if (renderingEngine) {
      await renderingEngine.destroy();
      console.log(`Cleaned up Cornerstone3D resources for renderingEngine: ${renderingEngineId}`);
    }

    // Clear image cache
    core.cache.purgeCache();
  } catch (error) {
    console.error('Error cleaning up Cornerstone3D resources:', error);
  }
}

/**
 * Validate image IDs with enhanced error checking
 */
export async function validateImageIds(imageIds: string[]): Promise<{
  valid: boolean;
  validatedIds: string[];
  issues: string[];
}> {
  try {
    return await cornerstoneService.validateImages(imageIds);
  } catch (error) {
    console.error('Error validating image IDs:', error);
    return {
      valid: false,
      validatedIds: [],
      issues: [error instanceof Error ? error.message : 'Unknown error validating images']
    };
  }
}

/**
 * Set a tool as active
 */
export async function setToolActive(toolGroupId: string, toolName: UiToolType, options: any = {}): Promise<void> {
  try {
    const tools = await import('@cornerstonejs/tools');
    const toolGroup = tools.ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) {
      throw new Error(`Tool group ${toolGroupId} not found`);
    }

    const cornerstoneToolName = mapUiToolToCornerstone3D(toolName);
    toolGroup.setToolActive(cornerstoneToolName, {
      bindings: [{ mouseButton: 1 }],
      ...options
    });
  } catch (error) {
    console.error(`Error setting tool ${toolName} as active:`, error);
    throw error;
  }
}

// Export types
export type { Types }; 