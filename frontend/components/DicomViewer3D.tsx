"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cornerstoneService } from '@/lib/services/cornerstoneService';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums, cache } from '@cornerstonejs/core';
import * as cornerstone3D from '@cornerstonejs/core';
import { ToolGroupManager, Enums as csToolsEnums } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';
import { UiToolType, mapUiToolToCornerstone3D } from '@/lib/utils/cornerstone3DInit';
import { volumeLoaderService } from '@/lib/services/cornerstone/volumeLoader';

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
      <div className="text-red-500 mb-2">
        <svg 
          className="h-12 w-12" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
          />
        </svg>
      </div>
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
  
  // Add refs for tracking component state
  const isMounted = useRef(true);
  const isInitialized = useRef(false);
  const viewportId = useRef(`viewport-${Math.random().toString(36).substr(2, 9)}`);
  const renderingEngineId = useRef(`engine-${Date.now()}`);
  const toolGroupId = useRef(`toolgroup-${Math.random().toString(36).substr(2, 9)}`);
  const engineCreated = useRef(false);
  const currentImageIdsRef = useRef<string[]>([]);
  const lastLoadedImageIds = useRef<string[]>([]);
  const hasAttemptedInitialRender = useRef(false);
  let initTimer: ReturnType<typeof setTimeout>;
  
  // Add new state for tracking volume loading
  const [volumeLoadingAttempted, setVolumeLoadingAttempted] = useState(false);
  const [volumeLoadingFailed, setVolumeLoadingFailed] = useState(false);
  const currentVolumeId = useRef<string | null>(null);
  
  // Track current image IDs with a ref to avoid dependency array issues
  useEffect(() => {
    currentImageIdsRef.current = imageIds;
  }, [imageIds]);
  
  // Update the cleanupViewport function
  const cleanupViewport = useCallback(async () => {
    try {
      if (!isMounted.current) return;
      
      console.log(`DicomViewer3D: Starting cleanup of viewport ${viewportId.current}`);
      
      // First check if we have a rendering engine
      const engine = cornerstone3D.getRenderingEngine(renderingEngineId.current);
      if (!engine) {
        console.log(`DicomViewer3D: No rendering engine found for cleanup`);
        return;
      }
      
      // Clean up the tool group first
      try {
        const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId.current);
        if (toolGroup) {
          // Get all tools and set them to disabled
          const tools = Object.keys(toolGroup.toolOptions || {});
          tools.forEach(toolName => {
            try {
              toolGroup.setToolDisabled(toolName);
            } catch (e) {
              console.warn(`DicomViewer3D: Error disabling tool ${toolName}:`, e);
            }
          });
          
          // Then destroy the tool group
          try {
            cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId.current);
          } catch (e) {
            console.warn(`DicomViewer3D: Error destroying tool group:`, e);
          }
        }
      } catch (tgError) {
        console.warn(`DicomViewer3D: Error cleaning up tool group:`, tgError);
      }
      
      // Clean up the viewport
      try {
        engine.disableElement(viewportId.current);
        engineCreated.current = false;
      } catch (vpError) {
        console.warn(`DicomViewer3D: Error disabling viewport:`, vpError);
      }
    } catch (error) {
      console.error(`DicomViewer3D: Error in cleanupViewport:`, error);
    }
  }, []);
  
  // Effect to handle viewport resize when expansion state changes
  useEffect(() => {
    if (!isEnabled || !elementRef.current || !isMounted.current) return;
    
    const handleResize = () => {
      try {
        if (!elementRef?.current || !isMounted.current) return;
        
        const engine = cornerstone3D.getRenderingEngine(renderingEngineId.current);
        if (!engine) {
          // Log but don't set an error when engine is not available during resize
          console.log(`DicomViewer3D: Cannot resize - engine ${renderingEngineId.current} not available`);
          return;
        }
        
        // Resize the viewport
        engine.resize();
        
        // If we have a valid engine and can resize, we've definitely moved past the initial load
        setIsInitialLoad(false);
      } catch (error) {
        // Silently log resize errors but don't show them in the UI
        console.warn('DicomViewer3D: Resize error:', error);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isEnabled, isExpanded]);
  
  const cleanImageId = (id: string): string => {
    // If it already has a proper prefix like wadouri: or wadors:, return as is
    if (id.startsWith('wadouri:') || id.startsWith('wadors:') || 
        id.startsWith('https:') || id.startsWith('http:') ||
        id.startsWith('nifti:')) {
      return id;
    }
    
    // If it has a hash, it's likely a URL with a filename
    if (id.includes('#')) {
      const [url, filename] = id.split('#');
      // Check file extension to determine format
      if (filename.toLowerCase().endsWith('.dcm')) {
        return `wadouri:${url}`;
      } else if (filename.toLowerCase().endsWith('.nii') || filename.toLowerCase().endsWith('.nii.gz')) {
        return `nifti:${url}`;
      } else {
        // For other image types
        return `https:${url}`;
      }
    }
    
    // Default to wadouri: for unknown formats
    return `wadouri:${id}`;
  };
  
  const processImageIds = (ids: string[]): string[] => {
    // Ensure we have image IDs
    if (!ids || ids.length === 0) {
      setError('No image IDs provided');
      return [];
    }
    
    // Process and clean each image ID
    const processedIds = ids.map(id => {
      // Skip empty IDs
      if (!id) return null;
      
      try {
        return cleanImageId(id);
      } catch (e) {
        console.error('Error processing image ID:', e);
        return null;
      }
    }).filter(Boolean) as string[];
    
    if (processedIds.length === 0) {
      setError('No valid image IDs found');
    } else {
      console.log(`Processed ${processedIds.length} image IDs`);
      // Log the first few for debugging
      processedIds.slice(0, 3).forEach(id => console.log(`- Image ID: ${id}`));
    }
    
    return processedIds;
  };
  
  // Update the initialization effect
  useEffect(() => {
    if (isInitialized.current) {
      return;
    }

    const initialize = async () => {
      if (!isMounted.current || isInitialized.current) return;
      
      try {
        // Set id on element
        if (elementRef.current) {
          const elementId = `element-${viewportId.current}`;
          elementRef.current.id = elementId;
        }

        // Initialize Cornerstone with proper error handling
        await cornerstoneService.initialize();
        
        isInitialized.current = true;
        setIsEnabled(true);
        console.log('DicomViewer3D: Initialization complete');
      } catch (error) {
        console.error('Error initializing Cornerstone3D:', error);
        setError('Failed to initialize viewer');
        if (onImageLoaded) {
          onImageLoaded(false, false);
        }
      }
    };

    // Add a small delay before initialization
    initTimer = setTimeout(() => {
      if (isMounted.current) {
        initialize();
      }
    }, 100);

    return () => {
      if (initTimer) clearTimeout(initTimer);
    };
  }, [onImageLoaded]);
  
  // Update the tool change effect
  useEffect(() => {
    if (!isEnabled || !elementRef.current) return;
    if (activeTool === currentTool) return;
    
    try {
      console.log(`DicomViewer3D: Tool change requested from ${currentTool} to ${activeTool}`);
      
      // Map UI tool to Cornerstone3D tool
      const toolName = mapUiToolToCornerstone3D(activeTool);
      
      console.log(`DicomViewer3D: Mapped UI tool ${activeTool} to Cornerstone3D tool ${toolName}`);
      
      if (toolName) {
        const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId.current);
        if (toolGroup) {
          // First, set all tools to disabled
          const tools = Object.keys(toolGroup.toolOptions || {});
          tools.forEach(name => {
            if (name !== toolName) {
              toolGroup.setToolDisabled(name);
            }
          });
          
          // Then activate the requested tool
          toolGroup.setToolActive(toolName, {
            bindings: [
              {
                mouseButton: MouseBindings.Primary
              }
            ]
          });
          setCurrentTool(activeTool);
          console.log(`DicomViewer3D: Successfully activated tool ${toolName}`);
        } else {
          console.warn(`DicomViewer3D: No tool group found for ${toolGroupId.current}`);
        }
      } else {
        console.warn(`DicomViewer3D: No valid tool name mapped for ${activeTool}, keeping current tool ${currentTool}`);
      }
    } catch (error) {
      console.error('DicomViewer3D: Error setting active tool:', error);
      // Try to fall back to a default tool
      try {
        const fallbackTool = 'pan';
        const fallbackToolName = mapUiToolToCornerstone3D(fallbackTool);
        const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId.current);
        if (toolGroup) {
          toolGroup.setToolActive(fallbackToolName, {
            bindings: [
              {
                mouseButton: MouseBindings.Primary
              }
            ]
          });
          setCurrentTool(fallbackTool);
          console.log(`DicomViewer3D: Fallback to tool ${fallbackToolName} after error`);
        }
      } catch (fallbackError) {
        console.error('DicomViewer3D: Error setting fallback tool:', fallbackError);
      }
    }
  }, [activeTool, isEnabled, currentTool]);
  
  // Update the setupViewport function
  const setupViewport = useCallback(async () => {
    if (!isMounted.current || !isInitialized.current) {
      return;
    }

    try {
      const elementId = elementRef.current?.id;
      if (!elementId) {
        throw new Error('Element not found');
      }

      setError(null);
      setLoading(true);

      // Process image IDs
      const processedImageIds = await processImageIds(currentImageIdsRef.current);
      
      if (processedImageIds.length === 0) {
        setError('No valid images provided');
        setLoading(false);
        if (onImageLoaded) onImageLoaded(false, false);
        return;
      }

      // Validate images
      const validationResult = await cornerstoneService.validateImages(processedImageIds);
      if (!validationResult.valid) {
        setError('Invalid image format');
        setLoading(false);
        if (onImageLoaded) onImageLoaded(false, false);
        return;
      }

      // Check if we can load as volume
      let isVolumeData = false;
      if (processedImageIds.length > 2) {
        try {
          await cornerstoneService.validateImages([processedImageIds[0]]);
          isVolumeData = await volumeLoaderService.canLoadAsVolume(processedImageIds);
          console.log(`Volume loading check result: ${isVolumeData ? 'CAN' : 'CANNOT'} load as volume`);
        } catch (error) {
          console.warn('Error checking volume capability:', error);
          isVolumeData = false;
        }
      }

      // Clean up existing viewport
      await cleanupViewport();
      
      // Get rendering engine
      const renderingEngine = await cornerstoneService.getRenderingEngine(
        renderingEngineId.current,
        isVolumeData ? 'VOLUME' : 'STACK'
      );

      if (!renderingEngine || !isMounted.current) {
        throw new Error('Failed to create rendering engine');
      }

      // Create viewport
      const viewportInput: Types.PublicViewportInput = {
        viewportId: viewportId.current,
        element: elementRef.current as HTMLDivElement,
        type: isVolumeData ? Enums.ViewportType.ORTHOGRAPHIC : Enums.ViewportType.STACK,
        defaultOptions: {
          background: [0, 0, 0] as [number, number, number],
          orientation: getViewportOrientation(viewportType)
        }
      };

      renderingEngine.enableElement(viewportInput);
      
      // Load images
      if (isVolumeData) {
        try {
          const volumeId = `volume-${Date.now()}`;
          currentVolumeId.current = volumeId;
          
          const volume = await cornerstone3D.volumeLoader.createAndCacheVolume(volumeId, {
            imageIds: processedImageIds
          });

          const viewport = renderingEngine.getViewport(viewportId.current) as Types.IVolumeViewport;
          await viewport.setVolumes([
            {
              volumeId,
              callback: ({ volumeActor }: { volumeActor: Types.VolumeActor }) => {
                volumeActor.getProperty().setInterpolationTypeToLinear();
                return volumeActor;
              }
            }
          ]);

          await volume.load();
          viewport.render();
          
          setIs3D(true);
          setVolumeLoadingAttempted(true);
          setVolumeLoadingFailed(false);
        } catch (volumeError) {
          console.error('Volume loading failed:', volumeError);
          setVolumeLoadingFailed(true);
          // Fall back to stack viewport
          await loadAsStack(renderingEngine, processedImageIds);
        }
      } else {
        await loadAsStack(renderingEngine, processedImageIds);
      }

      setLoading(false);
      if (onImageLoaded) {
        onImageLoaded(true, !isVolumeData);
      }
    } catch (error) {
      console.error('Error in viewport setup:', error);
      setError(`Setup error: ${error instanceof Error ? error.message : String(error)}`);
      setLoading(false);
      if (onImageLoaded) onImageLoaded(false, false);
    }
  }, [imageId, viewportType, onImageLoaded, processImageIds, cleanupViewport]);
  
  // Add helper function for stack loading
  const loadAsStack = async (renderingEngine: RenderingEngine, imageIds: string[]) => {
    const viewport = renderingEngine.getViewport(viewportId.current) as Types.IStackViewport;
    await viewport.setStack(imageIds);
    viewport.render();
    setIs3D(false);
  };

  // Add helper function for viewport orientation
  const getViewportOrientation = (type: string): Enums.OrientationAxis => {
    switch (type) {
      case 'SAGITTAL':
        return Enums.OrientationAxis.SAGITTAL;
      case 'CORONAL':
        return Enums.OrientationAxis.CORONAL;
      case 'AXIAL':
      default:
        return Enums.OrientationAxis.AXIAL;
    }
  };
  
  // Set up viewport when it is active
  useEffect(() => {
    if (!elementRef?.current || !isActive || !isInitialized.current || !isMounted.current) {
      return;
    }
    
    console.log('DicomViewer3D: Setting up viewport - isActive:', isActive);
    
    // Check if we have image IDs
    const currentImages = currentImageIdsRef.current;
    const hasImages = (currentImages && currentImages.length > 0) || !!imageId;
    
    if (!hasImages) {
      console.log('DicomViewer3D: No images to load, skipping rendering engine creation');
      // Reset states without attempting to load
      setLoading(false);
      setIsInitialLoad(true);
      setDidAttemptLoading(false);
      setError(null);
      engineCreated.current = false;
      if (onImageLoaded) onImageLoaded(false, false);
      return;
    }
    
    // Set up the viewport
    setupViewport();
  }, [isActive, imageId, setupViewport, onImageLoaded]);
  
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
    console.log('DicomViewer3D: EXPAND BUTTON CLICKED', {
      viewportType,
      currentIsExpanded: isExpanded,
      elementId: elementRef.current?.id,
      hasCanvas: !!elementRef.current?.querySelector('canvas'),
      viewportDimensions: elementRef.current?.getBoundingClientRect()
    });
    
    // Force canvas resize before toggling
    if (elementRef.current) {
      const canvas = elementRef.current.querySelector('canvas');
      if (canvas) {
        console.log('DicomViewer3D: Canvas dimensions before resize:', {
          width: canvas.style.width,
          height: canvas.style.height,
          offsetWidth: canvas.offsetWidth,
          offsetHeight: canvas.offsetHeight,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight
        });
        canvas.style.width = !isExpanded ? '100%' : '';
        canvas.style.height = !isExpanded ? '100%' : '';
        console.log('DicomViewer3D: Canvas dimensions after resize:', {
          width: canvas.style.width,
          height: canvas.style.height,
          offsetWidth: canvas.offsetWidth,
          offsetHeight: canvas.offsetHeight,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight
        });
      } else {
        console.warn('DicomViewer3D: No canvas element found in viewport');
      }
    }
    
    if (onToggleExpand) {
      console.log('DicomViewer3D: Calling parent onToggleExpand');
      onToggleExpand();
    } else {
      console.warn('DicomViewer3D: No onToggleExpand handler provided');
    }
  };
  
  // Add viewport state logging effect
  useEffect(() => {
    console.log('DicomViewer3D: Viewport state updated', {
      viewportType,
      isExpanded,
      isActive,
      elementId: elementRef.current?.id,
      hasCanvas: !!elementRef.current?.querySelector('canvas'),
      viewportDimensions: elementRef.current?.getBoundingClientRect()
    });
  }, [viewportType, isExpanded, isActive]);
  
  // Add a function for forcing a reload
  const forceReload = useCallback(() => {
    console.log('DicomViewer3D: Force reload requested');
    
    // Clean up the viewport first
    cleanupViewport();
    
    // Clear the lastLoadedImageIds ref to force a reload
    lastLoadedImageIds.current = [];
    
    // Reset the loading state
    setDidAttemptLoading(false);
    setLoading(false);
    setError(null);
    
    // Reset viewport state
    setViewportState({
      isLoaded: false,
      is3D: false,
      viewportType: Enums.ViewportType.STACK,
      imageCount: 0,
      currentImageIndex: 0
    });
    
    // Add a small delay before allowing reload
    setTimeout(() => {
      console.log('DicomViewer3D: Ready for reload');
    }, 100);
  }, [cleanupViewport]);
  
  // Expose functions via ref
  useEffect(() => {
    if (viewerRef && 'current' in viewerRef) {
      viewerRef.current = {
        forceReload
      };
    }
  }, [viewerRef, forceReload]);
  
  return (
    <div 
      className={cn(
        "viewport-panel relative",
        isActive && "active",
        isExpanded && "expanded"
      )}
      onClick={handleActivate}
    >
      <div 
        id={`element-${viewportId.current}`}
        ref={elementRef}
        className={cn(
          "w-full h-full dicom-viewport",
          suppressErrors && "cornerstone-error-suppressed"
        )}
        style={{ 
          height: '100%',
          width: '100%',
          position: 'relative'
        }}
      />
      
      {onToggleExpand && !hideExpandButton && (
        <button
          className="viewport-expand-button"
          onClick={handleToggleExpand}
          aria-label={isExpanded ? "Minimize viewport" : "Expand viewport"}
        >
          {isExpanded ? (
            <Minimize2 size={16} />
          ) : (
            <Maximize2 size={16} />
          )}
        </button>
      )}
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
          <div className="flex flex-col items-center">
            <div className="animate-spin h-8 w-8 border-4 border-t-transparent border-[#4cedff] rounded-full mb-2"></div>
            <p>Loading image...</p>
          </div>
        </div>
      )}
      
      {error && !suppressErrors && (
        <ViewportError 
          message={error} 
          onRetry={() => {
            setError(null);
            if (hasAttemptedInitialRender.current) {
              setupViewport();
            }
          }} 
        />
      )}
      
      {/* Show "No image selected" message if:
       * 1. We're not loading AND
       * 2. Either we haven't attempted loading OR this is the initial load state
       */}
      {!loading && (!didAttemptLoading || isInitialLoad) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
          <div className="flex flex-col items-center p-4 max-w-[80%] text-center">
            <p className="font-medium">No image selected</p>
            <p className="text-sm mt-2">Load a series to view images in this viewport.</p>
          </div>
        </div>
      )}
      
      <div className="viewport-gradient" />
      
      {/* Suppress any cornerstone errors */}
      {suppressErrors && (
        <style jsx>{`
          .cornerstone-error-suppressed .cornerstone-canvas-error,
          .cornerstone-error-suppressed .cornerstone-errored,
          .cornerstone-error-suppressed [class*='error'] {
            display: none !important;
          }
        `}</style>
      )}
    </div>
  );
} 