import { volumeLoader, Enums, RenderingEngine, Types, metaData } from "@cornerstonejs/core";
import { cornerstoneService } from "./index";

export interface VolumeLoadOptions {
  imageIds: string[];
  volumeId?: string;
  options?: {
    imageIdIndex?: number;
    immediate?: boolean;
  };
}

export interface ViewportOptions {
  viewportId: string;
  type: Enums.ViewportType;
  element: HTMLDivElement;
  orientation?: Enums.OrientationAxis;
  background?: [number, number, number];
}

export class VolumeLoaderService {
  private static instance: VolumeLoaderService;

  private constructor() {}

  static getInstance(): VolumeLoaderService {
    if (!VolumeLoaderService.instance) {
      VolumeLoaderService.instance = new VolumeLoaderService();
    }
    return VolumeLoaderService.instance;
  }

  async loadVolume({ imageIds, volumeId = `volume-${Date.now()}`, options = {} }: VolumeLoadOptions) {
    await cornerstoneService.ensureInitialized();

    try {
      console.log(`Loading volume ${volumeId} with ${imageIds.length} images`);
      
      // Create and cache the volume
      const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds,
        ...options
      });

      // Load the volume
      await volume.load();

      console.log(`Volume ${volumeId} loaded successfully`);
      return { volumeId, volume };
    } catch (error) {
      console.error(`Error loading volume ${volumeId}:`, error);
      throw error;
    }
  }

  async createMPRViewports(
    renderingEngine: RenderingEngine,
    volumeId: string,
    viewports: ViewportOptions[]
  ) {
    try {
      console.log('Setting up MPR viewports');
      
      // Set up the viewports
      renderingEngine.setViewports(viewports);

      // Set the volume on all viewports
      const viewportIds = viewports.map(vp => vp.viewportId);
      await this.setVolumesForViewports(renderingEngine, volumeId, viewportIds);

      console.log('MPR viewports created successfully');
      return viewportIds;
    } catch (error) {
      console.error('Error creating MPR viewports:', error);
      throw error;
    }
  }

  private async setVolumesForViewports(
    renderingEngine: RenderingEngine,
    volumeId: string,
    viewportIds: string[]
  ) {
    try {
      // Get all viewports
      const viewports = viewportIds.map(id => renderingEngine.getViewport(id));

      // Set the volume on each viewport
      await Promise.all(
        viewports.map(async (viewport) => {
          if (viewport.type === Enums.ViewportType.ORTHOGRAPHIC ||
              viewport.type === Enums.ViewportType.VOLUME_3D) {
            await (viewport as Types.IVolumeViewport).setVolumes([
              { volumeId }
            ]);
          }
        })
      );

      // Render all viewports
      renderingEngine.render();
    } catch (error) {
      console.error('Error setting volumes for viewports:', error);
      throw error;
    }
  }

  async canLoadAsVolume(imageIds: string[]): Promise<boolean> {
    if (!imageIds || imageIds.length < 3) {
      return false;
    }

    try {
      // Try to load metadata for the first image
      const imageSpacing = metaData.get('imagePixelSpacing', imageIds[0]) || 
                          metaData.get('pixelSpacing', imageIds[0]);
      const imageOrientation = metaData.get('imageOrientationPatient', imageIds[0]);
      const imagePosition = metaData.get('imagePositionPatient', imageIds[0]);
      
      // Check if we have necessary 3D metadata
      if (!imageSpacing || !imageOrientation || !imagePosition) {
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error checking volume loading capability:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const volumeLoaderService = VolumeLoaderService.getInstance(); 