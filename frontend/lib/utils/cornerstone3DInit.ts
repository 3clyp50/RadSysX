// Cornerstone3D Initialization Module

// Core libraries
import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { cornerstoneService } from '@/lib/services/cornerstoneService';

// Cornerstone3D core modules
const {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  imageLoader,
  cache,
  metaData,
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
type BaseToolType = 
  | "pan"
  | "zoom"
  | "distance"
  | "area"
  | "angle"
  | "profile"
  | "window"
  | "level"
  | "diagnose"
  | "statistics"
  | "segment"
  | "compare"
  | "rectangleRoi"
  | "ellipticalRoi"
  | "circleRoi"
  | "brush"
  | "circleScissor"
  | "rectangleScissor"
  | "sphereScissor"
  | "eraser"
  | "threshold"
  | "magnify"
  | "stackScroll"
  | "crosshairs"
  | "volumeRotate";

// UI Tool type that matches the application's existing tool types
export type UiToolType = BaseToolType | null;

// Tool mapping type that excludes null
type ToolMapType = Record<BaseToolType, string>;

/**
 * Initialize the Cornerstone3D libraries with proper error handling
 */
export async function initializeCornerstone3D(): Promise<void> {
  try {
    await cornerstoneService.initialize();
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
 * Enhanced volume loading capability check
 */
export const canLoadAsVolume = async (imageIds: string[]): Promise<boolean> => {
  try {
    if (imageIds.length < 3) {
      return false;
    }

    // Load the first image to check metadata
    await imageLoader.loadAndCacheImage(imageIds[0]);

    // Check for required volume metadata
    const hasSpacing = !!metaData.get('imagePixelSpacing', imageIds[0]) || 
                      !!metaData.get('pixelSpacing', imageIds[0]);
    const hasOrientation = !!metaData.get('imageOrientationPatient', imageIds[0]);
    const hasPosition = !!metaData.get('imagePositionPatient', imageIds[0]);
    const hasThickness = !!metaData.get('sliceThickness', imageIds[0]);

    // Log metadata availability for debugging
    console.log('Volume loading metadata check:', {
      hasSpacing,
      hasOrientation,
      hasPosition,
      hasThickness,
      imageCount: imageIds.length
    });

    return hasSpacing && hasOrientation && hasPosition && hasThickness;
  } catch (error) {
    console.error('Error checking volume loading capability:', error);
    return false;
  }
};

/**
 * Map UI tool types to Cornerstone3D tool names with improved error handling
 */
export function mapUiToolToCornerstone3D(tool: UiToolType): string {
  try {
    if (tool === null) {
      return PanTool.toolName;
    }

    const toolMap: ToolMapType = {
      "pan": PanTool.toolName,
      "zoom": ZoomTool.toolName,
      "window": WindowLevelTool.toolName,
      "level": WindowLevelTool.toolName,
      "distance": LengthTool.toolName,
      "area": RectangleROITool.toolName,
      "rectangleRoi": RectangleROITool.toolName,
      "ellipticalRoi": EllipticalROITool.toolName,
      "circleRoi": CircleROITool.toolName,
      "angle": AngleTool.toolName,
      "profile": ProbeTool.toolName,
      "segment": BrushTool.toolName,
      "brush": BrushTool.toolName,
      "magnify": MagnifyTool.toolName,
      "stackScroll": StackScrollTool.toolName,
      "crosshairs": CrosshairsTool.toolName,
      "volumeRotate": "VolumeRotateMouseWheel", // Use string literal since the tool isn't directly imported
      "circleScissor": "CircleScissor",
      "rectangleScissor": "RectangleScissor",
      "sphereScissor": "SphereScissor",
      "eraser": "Eraser",
      "threshold": "Threshold",
      "diagnose": ProbeTool.toolName,
      "statistics": ProbeTool.toolName,
      "compare": ProbeTool.toolName
    };

    return toolMap[tool] || PanTool.toolName;
  } catch (error) {
    console.error('Error mapping tool:', error);
    return PanTool.toolName;
  }
}

/**
 * Clean up Cornerstone3D resources with enhanced error handling
 */
export function cleanupCornerstone3D(renderingEngineId: string, toolGroupIds: string[] = []) {
  try {
    // Clean up tool groups
    toolGroupIds.forEach(toolGroupId => {
      try {
        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (toolGroup) {
          // Disable all tools before destroying
          const tools = Object.keys(toolGroup.toolOptions || {});
          tools.forEach(toolName => {
            try {
              toolGroup.setToolDisabled(toolName);
            } catch (toolError) {
              console.warn(`Error disabling tool ${toolName}:`, toolError);
            }
          });
          ToolGroupManager.destroyToolGroup(toolGroupId);
        }
      } catch (toolError) {
        console.warn(`Error cleaning up tool group ${toolGroupId}:`, toolError);
      }
    });
    
    // Clean up rendering engine
    const renderingEngine = cornerstone3D.getRenderingEngine(renderingEngineId);
    if (renderingEngine) {
      renderingEngine.destroy();
      console.log(`Cleaned up Cornerstone3D resources for renderingEngine: ${renderingEngineId}`);
    }

    // Clear image cache
    cache.purgeCache();
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