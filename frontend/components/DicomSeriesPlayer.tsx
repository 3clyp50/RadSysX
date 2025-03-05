import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, ScanLine } from 'lucide-react';
import { RenderingEngine, Types, volumeLoader, Enums, cache, imageLoader } from '@cornerstonejs/core';
import { createImageIdsFromLocalFiles } from '@/lib/utils/createImageIdsAndCacheMetaData';

// Define anatomical plane types
export type AnatomicalPlane = 'AXIAL' | 'SAGITTAL' | 'CORONAL';

interface DicomSeriesPlayerProps {
  files: File[];
  className?: string;
  onFrameChange?: (frameIndex: number, totalFrames: number) => void;
  onPlanesReady?: (planes: Record<AnatomicalPlane, boolean>) => void;
  preferredPlane?: AnatomicalPlane;
  isActive?: boolean;
  disableUIControls?: boolean;
}

export function DicomSeriesPlayer({ 
  files, 
  className, 
  onFrameChange, 
  onPlanesReady,
  preferredPlane = 'AXIAL',
  isActive = true,
  disableUIControls = false
}: DicomSeriesPlayerProps) {
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(5); // Frames per second
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlane, setCurrentPlane] = useState<AnatomicalPlane>(preferredPlane);
  const [availablePlanes, setAvailablePlanes] = useState<Record<AnatomicalPlane, boolean>>({
    AXIAL: true,
    SAGITTAL: false,
    CORONAL: false
  });
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const loadedImagesRef = useRef<Set<number>>(new Set());
  const imageMetadataRef = useRef<Record<string, any>>({});
  
  // Initialize the component with the provided files
  useEffect(() => {
    const initializeViewer = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        if (!files || files.length === 0) {
          setError('No files provided');
          setIsLoading(false);
          return;
        }
        
        console.log(`DicomSeriesPlayer: Initializing with ${files.length} files`);
        
        // Create a new rendering engine if needed
        if (!renderingEngineRef.current && viewportRef.current) {
          renderingEngineRef.current = new RenderingEngine('dicom-series-player');
        }
        
        // Create image IDs from files using the local files function
        const ids = await createImageIdsFromLocalFiles(files);
        setImageIds(ids);
        
        if (ids.length === 0) {
          setError('No valid DICOM images found');
          setIsLoading(false);
          return;
        }
        
        console.log(`DicomSeriesPlayer: Created ${ids.length} image IDs`);
        
        // Set up the viewport
        if (viewportRef.current && renderingEngineRef.current) {
          const viewportInput = {
            viewportId: 'DICOM_PLAYER',
            element: viewportRef.current,
            type: Enums.ViewportType.STACK,
          };
          
          renderingEngineRef.current.enableElement(viewportInput);
          
          // Get the viewport
          const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
          
          // Set the stack of images
          await viewport.setStack(ids);
          
          // Set initial image
          await viewport.setImageIdIndex(0);
          
          // Render
          renderingEngineRef.current.render();
        }
        
        setIsLoading(false);
        
        // Notify about the initial frame
        if (onFrameChange) {
          onFrameChange(0, ids.length);
        }
      } catch (err: unknown) {
        console.error('Error initializing DicomSeriesPlayer:', err);
        setError('Failed to initialize viewer');
        setIsLoading(false);
      }
    };
    
    initializeViewer();
    
    // Clean up on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Cleanup rendering engine
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
      }
      
      // Clean up image URLs
      imageIds.forEach(imageId => {
        try {
          if (typeof imageId === 'string') {
            // Handle different URL formats
            const urlMatch = imageId.match(/^(wadouri:|wadors:|https?:)(.+?)(?:#|$)/);
            if (urlMatch && urlMatch[2]) {
              const blobUrl = urlMatch[2];
              if (blobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrl);
              }
            }
          }
        } catch (e) {
          console.warn('Error revoking URL:', e);
        }
      });
    };
  }, [files]);
  
  // Handle play/pause
  useEffect(() => {
    if (isPlaying && renderingEngineRef.current) {
      timerRef.current = setInterval(async () => {
        const viewport = renderingEngineRef.current?.getViewport('DICOM_PLAYER') as Types.IStackViewport;
        if (viewport) {
          const nextIndex = (currentIndex + 1) % imageIds.length;
          await viewport.setImageIdIndex(nextIndex);
          renderingEngineRef.current?.render();
          setCurrentIndex(nextIndex);
          if (onFrameChange) {
            onFrameChange(nextIndex, imageIds.length);
          }
        }
      }, 1000 / fps);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, fps, imageIds.length, currentIndex]);
  
  // Playback controls
  const togglePlayPause = () => setIsPlaying(!isPlaying);
  
  const goToNext = async () => {
    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
      const nextIndex = (currentIndex + 1) % imageIds.length;
      await viewport.setImageIdIndex(nextIndex);
      renderingEngineRef.current.render();
      setCurrentIndex(nextIndex);
      if (onFrameChange) {
        onFrameChange(nextIndex, imageIds.length);
      }
    }
  };
  
  const goToPrevious = async () => {
    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
      const nextIndex = (currentIndex - 1 + imageIds.length) % imageIds.length;
      await viewport.setImageIdIndex(nextIndex);
      renderingEngineRef.current.render();
      setCurrentIndex(nextIndex);
      if (onFrameChange) {
        onFrameChange(nextIndex, imageIds.length);
      }
    }
  };
  
  const goToFirst = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
      viewport.setImageIdIndex(0);
      renderingEngineRef.current.render();
    }
  };
  
  const goToLast = () => {
    setIsPlaying(false);
    const lastIndex = imageIds.length - 1;
    setCurrentIndex(lastIndex);
    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
      viewport.setImageIdIndex(lastIndex);
      renderingEngineRef.current.render();
    }
  };
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentIndex(newIndex);
    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
      viewport.setImageIdIndex(newIndex);
      renderingEngineRef.current.render();
    }
  };
  
  const handleFpsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFps(parseInt(e.target.value, 10));
  };
  
  // Handle plane change
  const handlePlaneChange = (plane: AnatomicalPlane) => {
    if (availablePlanes[plane]) {
      setCurrentPlane(plane);
      if (renderingEngineRef.current) {
        const viewport = renderingEngineRef.current.getViewport('DICOM_PLAYER') as Types.IStackViewport;
        viewport.setImageIdIndex(0);
        renderingEngineRef.current.render();
      }
    }
  };
  
  return (
    <div className={`dicom-series-player ${className || ''}`}>
      <div 
        ref={viewportRef} 
        className="dicom-viewport" 
        style={{ width: '100%', height: 'calc(100% - 100px)', background: '#000' }}
      >
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <div className="loading-text">Loading DICOM series...</div>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <div className="error-icon">⚠️</div>
            <div>{error}</div>
          </div>
        )}
        
        {!isLoading && !error && imageIds.length === 0 && (
          <div className="empty-message">
            <div className="info-icon">ℹ️</div>
            <div>No images available for this plane</div>
            <div className="empty-suggestion">Try selecting a different plane orientation</div>
          </div>
        )}
      </div>
      
      {/* Always show plane selection even if current plane is empty */}
      <div className="plane-selection">
        <button 
          onClick={() => handlePlaneChange('AXIAL')} 
          className={`plane-button ${currentPlane === 'AXIAL' ? 'active' : ''} ${!availablePlanes.AXIAL ? 'disabled' : ''}`}
          disabled={!availablePlanes.AXIAL}
        >
          <ScanLine size={14} />
          <span>Axial</span>
          {imageIds.length > 0 && (
            <span className="plane-image-count">{imageIds.length}</span>
          )}
        </button>
        <button 
          onClick={() => handlePlaneChange('SAGITTAL')} 
          className={`plane-button ${currentPlane === 'SAGITTAL' ? 'active' : ''} ${!availablePlanes.SAGITTAL ? 'disabled' : ''}`}
          disabled={!availablePlanes.SAGITTAL}
        >
          <ScanLine size={14} className="rotate-90" />
          <span>Sagittal</span>
          {imageIds.length > 0 && (
            <span className="plane-image-count">{imageIds.length}</span>
          )}
        </button>
        <button 
          onClick={() => handlePlaneChange('CORONAL')} 
          className={`plane-button ${currentPlane === 'CORONAL' ? 'active' : ''} ${!availablePlanes.CORONAL ? 'disabled' : ''}`}
          disabled={!availablePlanes.CORONAL}
        >
          <ScanLine size={14} className="rotate-90" />
          <span>Coronal</span>
          {imageIds.length > 0 && (
            <span className="plane-image-count">{imageIds.length}</span>
          )}
        </button>
      </div>
      
      {imageIds.length > 0 && (
        <div className="controls-panel">
          <div className="playback-controls">
            <button onClick={goToFirst} className="control-button" title="Go to first frame">
              <SkipBack size={16} />
            </button>
            <button onClick={goToPrevious} className="control-button" title="Previous frame">
              <ChevronLeft size={16} />
            </button>
            <button onClick={togglePlayPause} className="control-button play-pause" title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={goToNext} className="control-button" title="Next frame">
              <ChevronRight size={16} />
            </button>
            <button onClick={goToLast} className="control-button" title="Go to last frame">
              <SkipForward size={16} />
            </button>
          </div>
          
          <div className="slider-container">
            <input
              type="range"
              min={0}
              max={imageIds.length - 1}
              value={currentIndex}
              onChange={handleSliderChange}
              className="frame-slider"
            />
            <div className="frame-info">
              {currentIndex + 1} / {imageIds.length}
            </div>
          </div>
          
          <div className="fps-control">
            <label htmlFor="fps-slider">Speed: {fps} fps</label>
            <input
              id="fps-slider"
              type="range"
              min={1}
              max={30}
              value={fps}
              onChange={handleFpsChange}
              className="fps-slider"
            />
          </div>
        </div>
      )}
      
      <style jsx>{`
        .dicom-series-player {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: 4px;
          background: #1a1a1a;
          color: white;
        }
        
        .loading-overlay,
        .error-message {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          text-align: center;
        }
        
        .spinner {
          border: 3px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          border-top: 3px solid white;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin-bottom: 10px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .plane-selection {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 8px;
          background: #2a2a2a;
          border-top: 1px solid #3a3a3a;
        }
        
        .plane-button {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 4px;
          background: #3a3a3a;
          border: none;
          color: white;
          font-size: 12px;
          cursor: pointer;
        }
        
        .plane-button:hover {
          background: #4a4a4a;
        }
        
        .plane-button.active {
          background: #4cedff;
          color: #1a1a1a;
        }
        
        .plane-button.disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: #333;
        }
        
        .controls-panel {
          padding: 10px;
          background: #2a2a2a;
          border-top: 1px solid #3a3a3a;
        }
        
        .playback-controls {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .control-button {
          background: #3a3a3a;
          border: none;
          color: white;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .control-button:hover {
          background: #4a4a4a;
        }
        
        .play-pause {
          background: #4cedff;
          color: #1a1a1a;
        }
        
        .play-pause:hover {
          background: #3db5c7;
        }
        
        .slider-container {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .frame-slider {
          flex-grow: 1;
          height: 6px;
          -webkit-appearance: none;
          appearance: none;
          background: #3a3a3a;
          outline: none;
          border-radius: 3px;
        }
        
        .frame-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #4cedff;
          cursor: pointer;
        }
        
        .frame-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #4cedff;
          cursor: pointer;
          border: none;
        }
        
        .frame-info {
          font-size: 12px;
          min-width: 60px;
          text-align: center;
        }
        
        .fps-control {
          display: flex;
          flex-direction: column;
          font-size: 12px;
        }
        
        .fps-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          background: #3a3a3a;
          outline: none;
          border-radius: 2px;
          margin-top: 5px;
        }
        
        .fps-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4cedff;
          cursor: pointer;
        }
        
        .fps-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4cedff;
          cursor: pointer;
          border: none;
        }
        
        .error-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        
        .rotate-90 {
          transform: rotate(90deg);
        }
        
        .empty-message {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          color: white;
          text-align: center;
          background: rgba(0, 0, 0, 0.7);
        }
        
        .info-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        
        .empty-suggestion {
          font-size: 14px;
          opacity: 0.8;
          margin-top: 10px;
        }
        
        .plane-image-count {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          padding: 1px 6px;
          font-size: 10px;
          margin-left: 5px;
        }
      `}</style>
    </div>
  );
} 