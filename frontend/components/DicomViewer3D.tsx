"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { 
  createViewport,
  createToolGroup,
  setToolActive,
  mapUiToolToCornerstone3D,
  loadAndDisplayImageStack,
  loadAndDisplayVolume,
  is2DImage,
  canLoadAsVolume,
  type UiToolType
} from '@/lib/utils/cornerstone3DInit';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import * as cornerstone3D from '@cornerstonejs/core';
import { cn } from '@/lib/utils';
import { cornerstoneService } from '@/lib/services/cornerstoneService';

// Use the UI tool type from the cornerstone3D initialization
type Tool = UiToolType;

interface DicomViewer3DProps {
  imageId?: string;
  imageIds?: string[];
  viewportType: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D' | 'SERIES';
  isActive?: boolean;
  isExpanded?: boolean;
  onActivate?: () => void;
  onToggleExpand?: () => void;
  onImageLoaded?: (success: boolean, is2DImage: boolean) => void;
  activeTool?: Tool;
  suppressErrors?: boolean;
  hideExpandButton?: boolean;
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
  hideExpandButton = false
}: DicomViewer3DProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>(activeTool);
  const [didAttemptLoading, setDidAttemptLoading] = useState(false);
  
  // Keep track of IDs for cleanup
  const renderingEngineId = useRef(`engine-${Date.now()}`);
  const toolGroupId = useRef(`toolgroup-${Date.now()}`);
  const viewportId = useRef(`viewport-${Date.now()}`);
  
  // Track if this is a 2D or 3D image
  const [is3D, setIs3D] = useState(false);
  
  // At the component level, add the state
  const [viewportState, setViewportState] = useState<ViewportState>({
    isLoaded: false,
    is3D: false,
    imageCount: 0,
    viewportType: Enums.ViewportType.STACK,
    currentImageIndex: 0
  });
  
  // Effect to handle viewport resize when expansion state changes
  useEffect(() => {
    if (!isEnabled || !elementRef.current) return;
    
    // Resize the viewport when expansion state changes
    try {
      console.log(`DicomViewer3D: Expansion state changed to ${isExpanded ? 'expanded' : 'normal'}`);
      
      const resizeViewport = () => {
        if (!cornerstoneService.hasRenderingEngine(renderingEngineId.current)) {
          console.log(`DicomViewer3D: Cannot resize - rendering engine ${renderingEngineId.current} no longer exists`);
          return;
        }
        
        console.log(`DicomViewer3D: Resizing viewport ${viewportId.current}`);
        
        // Force a layout update before resizing
        if (elementRef.current) {
          elementRef.current.style.width = isExpanded ? '100%' : '';
          elementRef.current.style.height = isExpanded ? '100%' : '';
        }
        
        // Wrap in try-catch to handle potential destroyed engines
        try {
          // Trigger resize
          const engine = cornerstone3D.getRenderingEngine(renderingEngineId.current);
          if (!engine) {
            console.log(`DicomViewer3D: Cannot resize - rendering engine ${renderingEngineId.current} not found`);
            return;
          }
          
          engine.resize();
          
          // Additional resize after a short delay
          setTimeout(() => {
            try {
              // Check if the engine still exists
              const currentEngine = cornerstone3D.getRenderingEngine(renderingEngineId.current);
              if (!currentEngine) return;
              
              if (elementRef.current) {
                const canvas = elementRef.current.querySelector('canvas');
                if (canvas) {
                  canvas.style.width = isExpanded ? '100%' : '';
                  canvas.style.height = isExpanded ? '100%' : '';
                }
              }
              currentEngine.resize();
              console.log(`DicomViewer3D: Delayed resize completed`);
            } catch (err) {
              console.error('Error during delayed resize:', err);
            }
          }, 100);
          
          // Final resize after layout stabilizes
          setTimeout(() => {
            try {
              // Check if the engine still exists
              const currentEngine = cornerstone3D.getRenderingEngine(renderingEngineId.current);
              if (!currentEngine) return;
              
              currentEngine.resize();
              console.log(`DicomViewer3D: Final resize completed`);
            } catch (err) {
              console.error('Error during final resize:', err);
            }
          }, 300);
        } catch (err) {
          console.error('Error during initial resize:', err);
        }
      };
      
      // Immediate resize attempt
      resizeViewport();
      
      // Add a resize observer to handle any container size changes
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === elementRef.current) {
            resizeViewport();
          }
        }
      });
      
      if (elementRef.current) {
        resizeObserver.observe(elementRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    } catch (error) {
      console.error('DicomViewer3D: Error setting up viewport resize:', error);
    }
  }, [isExpanded, isEnabled]);
  
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
  
  // Initialize cornerstone on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Use the cornerstoneService for initialization
        await cornerstoneService.initialize();
      } catch (error) {
        console.error('Error initializing Cornerstone3D:', error);
        setError('Failed to initialize Cornerstone3D');
        if (onImageLoaded) {
          onImageLoaded(false, false);
        }
      }
    };
    
    initialize();
    
    // Cleanup on unmount
    return () => {
      try {
        // Use the cornerstoneService to release the rendering engine
        if (cornerstoneService.hasRenderingEngine(renderingEngineId.current)) {
          cornerstoneService.releaseRenderingEngine(renderingEngineId.current);
        }
      } catch (err) {
        console.error('Error cleaning up Cornerstone3D resources:', err);
      }
    };
  }, []);
  
  // Effect to handle tool changes
  useEffect(() => {
    if (!isEnabled || !elementRef.current) return;
    if (activeTool === currentTool) return;
    
    try {
      console.log(`DicomViewer3D: Tool change requested from ${currentTool} to ${activeTool}`);
      
      // Map UI tool to Cornerstone3D tool
      const toolName = mapUiToolToCornerstone3D(activeTool);
      
      console.log(`DicomViewer3D: Mapped UI tool ${activeTool} to Cornerstone3D tool ${toolName}`);
      
      if (toolName) {
        setToolActive(toolGroupId.current, toolName, { mouseButton: 1 });
        setCurrentTool(activeTool);
        console.log(`DicomViewer3D: Successfully activated tool ${toolName}`);
      } else {
        console.warn(`DicomViewer3D: No valid tool name mapped for ${activeTool}, keeping current tool ${currentTool}`);
      }
    } catch (error) {
      console.error('DicomViewer3D: Error setting active tool:', error);
      // Try to fall back to a default tool
      try {
        const fallbackTool = 'pan';
        const fallbackToolName = mapUiToolToCornerstone3D(fallbackTool);
        setToolActive(toolGroupId.current, fallbackToolName, { mouseButton: 1 });
        setCurrentTool(fallbackTool);
        console.log(`DicomViewer3D: Fallback to tool ${fallbackToolName} after error`);
      } catch (fallbackError) {
        console.error('DicomViewer3D: Error setting fallback tool:', fallbackError);
      }
    }
  }, [activeTool, isEnabled, currentTool]);
  
  // Add a new resize event listener effect
  useEffect(() => {
    if (!isEnabled || !elementRef.current) return;
    
    // This will handle window resize events to properly resize the viewport
    const handleResize = () => {
      // Use a small delay to ensure the DOM has updated sizes
      setTimeout(async () => {
        try {
          if (!cornerstoneService.hasRenderingEngine(renderingEngineId.current)) {
            console.log(`DicomViewer3D: Cannot resize - engine ${renderingEngineId.current} not available`);
            return;
          }
          
          const engine = cornerstone3D.getRenderingEngine(renderingEngineId.current);
          if (!engine) {
            console.log(`DicomViewer3D: Cannot resize - engine ${renderingEngineId.current} not found`);
            return;
          }
          
          // Resize the rendering engine
          console.log(`DicomViewer3D: Resizing rendering engine ${renderingEngineId.current}`);
          engine.resize();
          engine.render();
        } catch (error) {
          console.warn('DicomViewer3D: Error during resize:', error);
        }
      }, 100);
    };

    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Call once to ensure proper initial size
    handleResize();
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isEnabled]);
  
  // Update the setupViewport function to properly handle rendering failures
  const setupViewport = useCallback(async () => {
    if (!elementRef.current || !imageIds || imageIds.length === 0) {
      console.log('DicomViewer3D: No images to display');
      return;
    }
    
    // First, ensure Cornerstone is properly initialized
    try {
      await cornerstoneService.initialize();
    } catch (initError) {
      console.error('DicomViewer3D: Failed to initialize Cornerstone:', initError);
      setError('Failed to initialize viewer. Please try again.');
      setLoading(false);
      if (onImageLoaded) onImageLoaded(false, false);
      return;
    }
    
    try {
      // Process image IDs
      let processedImageIds = processImageIds(imageId ? [imageId] : imageIds);
      
      // Clear any existing canvas elements in the container for a fresh start
      if (elementRef.current) {
        const existingCanvases = elementRef.current.querySelectorAll('canvas');
        existingCanvases.forEach(canvas => canvas.remove());
        console.log(`DicomViewer3D: Cleared ${existingCanvases.length} existing canvas elements`);
      }
      
      // Get rendering engine from service instead of creating directly
      const engine = await cornerstoneService.getRenderingEngine(renderingEngineId.current, viewportType);
      
      // Force a small delay to ensure the element is properly sized in the DOM
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Create the viewport with our settings
      const elementId = elementRef.current?.id || `element-viewport-${Date.now()}`;
      if (elementRef.current && !elementRef.current.id) {
        elementRef.current.id = elementId;
      }
      
      // Ensure the element has proper styles for rendering
      if (elementRef.current) {
        elementRef.current.style.position = 'relative';
        elementRef.current.style.width = '100%';
        elementRef.current.style.height = '100%';
        elementRef.current.style.overflow = 'hidden';
        elementRef.current.style.background = '#000';
      }
      
      // Get the correct viewport type based on dimensionality
      const is3DData = processedImageIds.length > 1 && await canLoadAsVolume(processedImageIds);
      const csViewportType = is3DData ? Enums.ViewportType.ORTHOGRAPHIC : Enums.ViewportType.STACK;
      
      // Update our state tracking the dimensionality
      setIs3D(is3DData);
      
      // Handle different viewport orientations
      let orientation;
      switch (viewportType) {
        case 'AXIAL': orientation = Enums.OrientationAxis.AXIAL; break;
        case 'SAGITTAL': orientation = Enums.OrientationAxis.SAGITTAL; break;
        case 'CORONAL': orientation = Enums.OrientationAxis.CORONAL; break;
        default: orientation = undefined;
      }
      
      // Try to load the images
      let loadSuccess = false;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (!loadSuccess && retryCount <= maxRetries) {
        try {
          // Create the viewport
          const viewport = createViewport(
            engine,
            elementId,
            viewportId.current,
            csViewportType,
            {
              orientation,
              background: [0, 0, 0],
            }
          );
          
          // Create a tool group and add the viewport to it
          const toolGroup = createToolGroup(toolGroupId.current, [viewportId.current], renderingEngineId.current);
          
          // Set the default tool active
          const defaultTool = activeTool || 'pan';
          const toolName = mapUiToolToCornerstone3D(defaultTool);
          if (toolName) {
            setToolActive(toolGroupId.current, toolName, { mouseButton: 1 });
            setCurrentTool(defaultTool);
          }
          
          // Load the image(s)
          if (csViewportType === Enums.ViewportType.STACK) {
            console.log(`DicomViewer3D: Loading as STACK (2D) with ${processedImageIds.length} images`);
            
            // Load as stack for 2D images
            loadSuccess = await loadAndDisplayImageStack(
              elementRef.current!,
              processedImageIds,
              viewportId.current,
              renderingEngineId.current
            );
          } else {
            console.log(`DicomViewer3D: Loading as VOLUME (3D) with ${processedImageIds.length} images`);
            
            // Load as volume for 3D images
            const volumeId = `volume-${Date.now()}`;
            loadSuccess = await loadAndDisplayVolume(
              elementRef.current!,
              processedImageIds,
              viewportId.current,
              volumeId,
              csViewportType,
              renderingEngineId.current
            );
          }
          
          if (loadSuccess) {
            console.log(`DicomViewer3D: Successfully loaded images for viewport ${viewportId.current}`);
            
            // Force a render to ensure the image is displayed
            engine.render();
            
            // Update state and callback
            setLoading(false);
            if (onImageLoaded) onImageLoaded(true, !is3DData);
            
            // Update view state for parent component tracking
            setViewportState({
              isLoaded: true,
              is3D: is3DData,
              imageCount: processedImageIds.length,
              viewportType: csViewportType,
              currentImageIndex: 0,
              orientation
            });
            
            console.log(`DicomViewer3D: Viewport state updated`, {
              isLoaded: true,
              is3D: is3DData,
              imageCount: processedImageIds.length,
            });
            
            break; // Exit the retry loop on success
          } else {
            console.warn(`DicomViewer3D: Failed to load images, retry ${retryCount+1}/${maxRetries+1}`);
            retryCount++;
            
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (loadError) {
          console.error(`DicomViewer3D: Error during load attempt ${retryCount+1}:`, loadError);
          retryCount++;
          
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!loadSuccess) {
        setError(`Failed to load images after ${maxRetries+1} attempts`);
        setLoading(false);
        if (onImageLoaded) onImageLoaded(false, false);
      }
    } catch (error) {
      console.error('DicomViewer3D: Error in viewport setup:', error);
      setError('Failed to set up viewport');
      setLoading(false);
      if (onImageLoaded) onImageLoaded(false, false);
    }
  }, [imageId, imageIds, viewportType, activeTool, onImageLoaded, processImageIds, canLoadAsVolume]);
  
  // Set up the viewport when image IDs are available
  useEffect(() => {
    if (!elementRef.current) return;
    
    // Don't re-run if already attempted loading (successful or not)
    if (didAttemptLoading && !isActive) return;
    
    setDidAttemptLoading(true);
    setError(null);
    setLoading(true);
    setIsEnabled(false);
    
    // Call our setupViewport function
    setupViewport()
      .then(() => {
        setLoading(false);
        setIsEnabled(true);
        if (onImageLoaded) {
          onImageLoaded(true, false);
        }
      })
      .catch((err) => {
        console.error('DicomViewer3D: Error setting up viewport:', err);
        setError(err.message || 'Failed to load image');
        setLoading(false);
        if (onImageLoaded) {
          onImageLoaded(false, false);
        }
      });
  }, [elementRef, imageId, imageIds.join(','), isActive, viewportType, activeTool, setupViewport, onImageLoaded]);
  
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
          width: '100%'
        }}
      />
      
      {onToggleExpand && !hideExpandButton && (
        <button
          className="viewport-expand-button"
          onClick={handleToggleExpand}
          aria-label={isExpanded ? "Minimize viewport" : "Expand viewport"}
        >
          {isExpanded ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
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
      
      {error && !loading && !suppressErrors && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <div className="flex flex-col items-center p-4 max-w-[80%] text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
            <p className="font-medium">{error}</p>
            <p className="text-sm mt-2">Try uploading the image again or check file format compatibility.</p>
          </div>
        </div>
      )}
      
      {!(imageId || imageIds.length > 0) && !loading && !error && !suppressErrors && !didAttemptLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
          <div className="flex flex-col items-center p-4 max-w-[80%] text-center">
            <p className="font-medium">No image selected</p>
            <p className="text-sm mt-2">Load a series to view images in this viewport.</p>
          </div>
        </div>
      )}
      
      <div className="viewport-gradient" />
      
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