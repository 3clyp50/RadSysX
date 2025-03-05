"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cornerstoneService, getCornerstoneInitState } from '@/lib/services/cornerstoneService';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums, cache, volumeLoader, setVolumesForViewports, metaData, imageLoader } from '@cornerstonejs/core';
import * as cornerstone3D from '@cornerstonejs/core';
import { ToolGroupManager, Enums as csToolsEnums } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';
import { UiToolType, mapUiToolToCornerstone3D, canLoadAsVolume } from '@/lib/utils/cornerstone3DInit';
import { volumeLoaderService } from '@/lib/services/cornerstone/volumeLoader';
import dicomParser from 'dicom-parser';

// Define the mouse button bindings
const MouseBindings = {
  Primary: 1,
  Secondary: 2,
  Auxiliary: 4
} as const;

// Define tool modes
const ToolModes = {
  Active: 'Active',
  Passive: 'Passive',
  Enabled: 'Enabled',
  Disabled: 'Disabled'
} as const;

interface DicomViewer3DProps {
  imageId?: string;
  imageIds?: string[];
  viewportType: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D' | 'SERIES';
  isActive?: boolean;
  isExpanded?: boolean;
  onActivate?: () => void;
  onToggleExpand?: () => void;
  onImageLoaded?: (success: boolean, is2DImage: boolean) => void;
  activeTool?: UiToolType;
  suppressErrors?: boolean;
  hideExpandButton?: boolean;
  viewerRef?: React.MutableRefObject<{
    forceReload: () => void;
  } | null>;
}

// Add a viewport state interface and state setter
interface ViewportState {
  isLoaded: boolean;
  is3D: boolean;
  imageCount: number;
  viewportType: Enums.ViewportType;
  currentImageIndex: number;
  orientation?: Enums.OrientationAxis;
}

// Add TypeScript interface for window object extension
declare global {
  interface Window {
    __cachePurged?: boolean;
  }
}

// Add a custom error component for better visibility
const ViewportError = ({message, onRetry}: {message: string, onRetry?: () => void}) => (
  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
    <div className="flex flex-col items-center space-y-4 max-w-md">
      <AlertCircle className="h-12 w-12 text-red-500 mb-2" />
      <h3 className="text-lg font-semibold text-center">Image Loading Error</h3>
      <p className="text-center text-slate-200">{message}</p>
      {onRetry && (
        <button 
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  </div>
);

// Add a new interface for initialization options
interface InitializationOptions {
  useVolumeLoader?: boolean;
  orientation?: Enums.OrientationAxis;
  background?: [number, number, number];
}

// Add this function after the imports
const createToolGroup = async (toolGroupId: string, viewportId: string, renderingEngineId: string) => {
  try {
    // Clean up existing tool group if it exists
    const existingToolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
    if (existingToolGroup) {
      cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId);
    }

    // Create new tool group
    const toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);
    if (!toolGroup) {
      throw new Error(`Failed to create tool group ${toolGroupId}`);
    }

    // Add tools to the tool group
    const tools = [
      { name: 'Pan', mode: csToolsEnums.ToolModes.Active },
      { name: 'Zoom', mode: csToolsEnums.ToolModes.Active },
      { name: 'WindowLevel', mode: csToolsEnums.ToolModes.Active },
      { name: 'StackScroll', mode: csToolsEnums.ToolModes.Active },
      { name: 'Length', mode: csToolsEnums.ToolModes.Active },
      { name: 'RectangleROI', mode: csToolsEnums.ToolModes.Active },
      { name: 'EllipticalROI', mode: csToolsEnums.ToolModes.Active },
      { name: 'CircleROI', mode: csToolsEnums.ToolModes.Active },
      { name: 'Angle', mode: csToolsEnums.ToolModes.Active },
      { name: 'Probe', mode: csToolsEnums.ToolModes.Active },
      { name: 'Brush', mode: csToolsEnums.ToolModes.Active },
      { name: 'Magnify', mode: csToolsEnums.ToolModes.Active },
      { name: 'Crosshairs', mode: csToolsEnums.ToolModes.Active }
    ];

    // Add each tool to the tool group
    for (const tool of tools) {
      toolGroup.addTool(tool.name, { mode: tool.mode });
    }

    // Add viewport to tool group
    toolGroup.addViewport(viewportId, renderingEngineId);

    return toolGroup;
  } catch (error) {
    console.error('Error creating tool group:', error);
    throw error;
  }
};

/**
 * New DicomViewer component that uses Cornerstone3D instead of legacy Cornerstone
 * This component supports both 2D and 3D viewing capabilities.
 */
export function DicomViewer3D({ 
  imageId, 
  imageIds = [],
  viewportType = 'AXIAL', 
  isActive = false,
  isExpanded = false,
  onActivate,
  onToggleExpand,
  onImageLoaded,
  activeTool = 'pan',
  suppressErrors = false,
  hideExpandButton = false,
  viewerRef
}: DicomViewer3DProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [didAttemptLoading, setDidAttemptLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [currentTool, setCurrentTool] = useState<UiToolType>('pan');
  const [viewportState, setViewportState] = useState<ViewportState>({
    isLoaded: false,
    is3D: false,
    viewportType: Enums.ViewportType.STACK,
    imageCount: 0,
    currentImageIndex: 0
  });
  const [viewport, setViewport] = useState<Types.IStackViewport | Types.IVolumeViewport | null>(null);
  const [renderingEngine, setRenderingEngine] = useState<RenderingEngine | null>(null);
  const viewportId = useRef(`viewport-${Math.random().toString(36).substring(2, 11)}`);
  const renderingEngineId = `engine-${Math.random().toString(36).substring(2, 11)}`;

  // Add refs for tracking component state
  const isMounted = useRef(true);
  const isInitialized = useRef(false);
  const toolGroupId = useRef(`toolgroup-${Math.random().toString(36).substr(2, 9)}`);
  const engineCreated = useRef(false);
  const currentImageIdsRef = useRef<string[]>([]);
  const lastLoadedImageIds = useRef<string[]>([]);
  const hasAttemptedInitialRender = useRef(false);

  // Track current image IDs with a ref to avoid dependency array issues
  useEffect(() => {
    currentImageIdsRef.current = imageIds;
  }, [imageIds]);

  // Update the cleanupViewport function
  const cleanupViewport = useCallback(async () => {
    try {
      if (!isMounted.current) return;
      
      console.log(`DicomViewer3D: Starting cleanup of viewport ${viewportId.current}`);
      
      // Clean up tool group first
      try {
        const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId.current);
        if (toolGroup) {
          // Disable all tools
          const tools = Object.keys(toolGroup.toolOptions || {});
          for (const toolName of tools) {
            try {
              toolGroup.setToolDisabled(toolName);
            } catch (e) {
              console.warn(`Error disabling tool ${toolName}:`, e);
            }
          }
          
          cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId.current);
        }
      } catch (tgError) {
        console.warn(`Error cleaning up tool group:`, tgError);
      }
      
      // Clean up the viewport
      try {
        const engine = cornerstone3D.getRenderingEngine(renderingEngineId);
        if (engine) {
          await engine.disableElement(viewportId.current);
          engineCreated.current = false;
          console.log(`DicomViewer3D: Disabled viewport ${viewportId.current}`);
        } else {
          console.log(`DicomViewer3D: No rendering engine found for cleanup`);
        }
      } catch (vpError) {
        console.warn(`Error disabling viewport:`, vpError);
      }
    } catch (error) {
      console.error(`Error in cleanupViewport:`, error);
    }
  }, []);

  // Effect to handle viewport resize when expansion state changes
  useEffect(() => {
    if (!isEnabled || !elementRef.current || !isMounted.current) return;

    const handleResize = () => {
      try {
        if (!elementRef?.current || !isMounted.current) return;
        
        const engine = cornerstone3D.getRenderingEngine(renderingEngineId);
        if (!engine) return;
        
        engine.resize();
        setIsInitialLoad(false);
      } catch (error) {
        console.warn('Resize error:', error);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isEnabled, isExpanded]);

  // Effect to handle initialization
  useEffect(() => {
    let isCancelled = false;
    const initializationId = Math.random().toString(36).substr(2, 9);

    const initializeViewer = async () => {
      try {
        // Ensure cornerstone service is initialized first
        await cornerstoneService.ensureInitialized();
        
        console.log('DicomViewer3D: Starting initialization with', { imageIds: imageIds.length, viewportType, isActive, initializationId });
        
        // Skip initialization if not active or no images
        if (!isActive || !imageIds.length) {
          console.log('DicomViewer3D: Skipping initialization - inactive or no images');
          return;
        }
        
        // Reset state
        setLoading(true);
        setError(null);
        setDidAttemptLoading(true);

        // First check if we can load this as a volume
        const isSingleImage = imageIds.length === 1;
        let useStackMode = isSingleImage;

        if (!isSingleImage) {
          try {
            const canUseVolume = await canLoadAsVolume(imageIds);
            console.log('DicomViewer3D: Volume capability check:', { canUseVolume, viewportType });
            useStackMode = !canUseVolume;
          } catch (error) {
            console.warn('DicomViewer3D: Error checking volume capability:', error);
            useStackMode = true;
          }
        }

        if (useStackMode) {
          try {
            console.log('DicomViewer3D: Using stack mode for', { isSingleImage, viewportType });

            const { viewport: newViewport, renderingEngine: newEngine } = await cornerstoneService.loadAndDisplayImageStack(
              elementRef.current!,
              imageIds,
              renderingEngineId,
              viewportId.current
            );
            
            if (isCancelled) return;
            
            setViewport(newViewport);
            setRenderingEngine(newEngine);
            setLoading(false);
            setError(null);
            setIsEnabled(true);
            engineCreated.current = true;
            
            if (onImageLoaded) {
              onImageLoaded(true, true);
            }
          } catch (error) {
            if (isCancelled) return;
            console.error('DicomViewer3D: Error loading in stack mode:', error);
            setError('Failed to load image');
            setLoading(false);
            if (onImageLoaded) {
              onImageLoaded(false, true);
            }
          }
          return;
        }

        // For volume viewing, proceed with volume initialization
        try {
          console.log('DicomViewer3D: Setting up volume viewing');
          const volumeId = `volume-${Date.now()}`;
          
          // Create the volume
          const volume = await volumeLoader.createAndCacheVolume(volumeId, {
            imageIds
          });

          if (isCancelled) return;

          // Create rendering engine
          const renderingEngine = new RenderingEngine(renderingEngineId);
          
          // Configure viewport
          const viewportInput: Types.PublicViewportInput = {
            viewportId: viewportId.current,
            element: elementRef.current as HTMLDivElement,
            type: Enums.ViewportType.ORTHOGRAPHIC,
            defaultOptions: {
              background: [0, 0, 0],
              orientation: viewportType === 'AXIAL' 
                ? Enums.OrientationAxis.AXIAL
                : viewportType === 'SAGITTAL'
                  ? Enums.OrientationAxis.SAGITTAL
                  : Enums.OrientationAxis.CORONAL
            }
          };

          // Enable viewport
          renderingEngine.enableElement(viewportInput);
          
          // Get viewport
          const viewport = renderingEngine.getViewport(viewportId.current);

          if (isCancelled) return;

          // Load the volume
          await volume.load();

          if (isCancelled) return;

          // Set up volumes in the viewport
          await setVolumesForViewports(renderingEngine, [
            {
              volumeId,
              callback: ({ volumeActor }) => {
                volumeActor.getProperty().setInterpolationTypeToLinear();
                return volumeActor;
              },
            },
          ], [viewportId.current]);

          viewport.render();
          
          setViewport(viewport as Types.IVolumeViewport);
          setRenderingEngine(renderingEngine);
          setLoading(false);
          setError(null);
          setIsEnabled(true);
          engineCreated.current = true;

          if (onImageLoaded) {
            onImageLoaded(true, false);
          }
        } catch (error) {
          if (isCancelled) return;
          console.error('DicomViewer3D: Error setting up volume viewing:', error);
          setError('Failed to initialize volume viewer');
          setLoading(false);
          if (onImageLoaded) {
            onImageLoaded(false, false);
          }
        }
      } catch (error) {
        if (isCancelled) return;
        console.error('DicomViewer3D: Initialization error:', error);
        setError('Failed to initialize viewer');
        setLoading(false);
        if (onImageLoaded) {
          onImageLoaded(false, false);
        }
      }
    };

    initializeViewer();

    return () => {
      isCancelled = true;
      console.log('DicomViewer3D: Cancelling initialization', initializationId);
    };
  }, [elementRef, imageIds, viewportType, isActive, onImageLoaded]);

  // Reset isInitialLoad after first mount
  useEffect(() => {
    return () => {
      setIsInitialLoad(false);
    };
  }, []);

  // Handle click to activate
  const handleActivate = () => {
    if (onActivate) {
      onActivate();
    }
  };

  // Handle toggle expand
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  // Update the useEffect for tool changes
  useEffect(() => {
    const updateTool = async () => {
      if (!isEnabled || !engineCreated.current) return;

      try {
        console.log(`DicomViewer3D: Tool change requested from ${currentTool} to ${activeTool}`);
        
        // Get the tool group
        let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId.current);
        
        // If no tool group exists, create one
        if (!toolGroup) {
          console.log(`DicomViewer3D: Creating new tool group ${toolGroupId.current}`);
          toolGroup = await createToolGroup(
            toolGroupId.current,
            viewportId.current,
            renderingEngineId
          );
        }

        // Map the UI tool to Cornerstone3D tool name
        const cornerstoneToolName = mapUiToolToCornerstone3D(activeTool);
        console.log(`DicomViewer3D: Mapped UI tool ${activeTool} to Cornerstone3D tool ${cornerstoneToolName}`);

        // Deactivate current tool if it exists
        if (currentTool) {
          const currentCornerstoneToolName = mapUiToolToCornerstone3D(currentTool);
          toolGroup.setToolPassive(currentCornerstoneToolName);
        }

        // Activate new tool
        toolGroup.setToolActive(cornerstoneToolName, {
          bindings: [{ mouseButton: MouseBindings.Primary }]
        });

        setCurrentTool(activeTool);
      } catch (error) {
        console.error('Error updating tool:', error);
      }
    };

    updateTool();
  }, [activeTool, isEnabled, engineCreated.current]);

  return (
    <div 
      ref={elementRef}
      className={cn(
        'relative w-full h-full bg-black',
        !isEnabled && 'cursor-not-allowed opacity-50'
      )}
      onClick={handleActivate}
    >
      {/* Error display */}
      {error && !suppressErrors && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-6 h-6" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
        </div>
      )}

      {/* Expand/collapse button */}
      {!hideExpandButton && (
        <button
          onClick={handleToggleExpand}
          className="absolute top-2 right-2 p-1 rounded-lg bg-black bg-opacity-50 text-white hover:bg-opacity-75 transition-opacity"
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      )}

      {/* Hide scrollbars */}
      <style jsx global>{`
        .cornerstone-canvas-wrapper {
          overflow: hidden !important;
        }
        .cornerstone-canvas-wrapper::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
    </div>
  );
}