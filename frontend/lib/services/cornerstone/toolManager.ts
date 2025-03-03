import { ToolGroupManager, Enums, Types } from "@cornerstonejs/tools";
import { cornerstoneService } from "./index";

const { MouseBindings } = Enums;

export interface ToolOptions {
  bindings?: Array<{
    mouseButton: typeof MouseBindings[keyof typeof MouseBindings];
    modifiers?: {
      alt?: boolean;
      ctrl?: boolean;
      shift?: boolean;
    };
  }>;
}

export class ToolManagerService {
  private static instance: ToolManagerService;
  private toolGroups: Map<string, Types.IToolGroup> = new Map();

  private constructor() {}

  static getInstance(): ToolManagerService {
    if (!ToolManagerService.instance) {
      ToolManagerService.instance = new ToolManagerService();
    }
    return ToolManagerService.instance;
  }

  async createToolGroup(id: string, viewportIds: string[] = [], renderingEngineId?: string): Promise<Types.IToolGroup> {
    await cornerstoneService.ensureInitialized();

    try {
      console.log(`Creating tool group ${id} for viewports:`, viewportIds);
      
      // Create the tool group
      const toolGroup = ToolGroupManager.createToolGroup(id);
      if (!toolGroup) {
        throw new Error(`Failed to create tool group ${id}`);
      }

      // Add default tools with their configurations
      this.addDefaultTools(toolGroup);

      // Add viewports to the tool group
      viewportIds.forEach(viewportId => {
        if (renderingEngineId) {
          toolGroup.addViewport(viewportId, renderingEngineId);
        } else {
          // For backward compatibility
          toolGroup.addViewport(viewportId);
        }
      });

      // Store the tool group
      this.toolGroups.set(id, toolGroup);

      console.log(`Tool group ${id} created successfully`);
      return toolGroup;
    } catch (error) {
      console.error(`Error creating tool group ${id}:`, error);
      throw error;
    }
  }

  private addDefaultTools(toolGroup: Types.IToolGroup): void {
    // Add basic manipulation tools
    toolGroup.addTool('Pan', {
      bindings: [{ mouseButton: MouseBindings.Auxiliary }]
    });

    toolGroup.addTool('WindowLevel', {
      bindings: [{ mouseButton: MouseBindings.Primary }]
    });

    toolGroup.addTool('Zoom', {
      bindings: [{ mouseButton: MouseBindings.Secondary }]
    });

    toolGroup.addTool('StackScroll', {
      bindings: [{ mouseButton: MouseBindings.Primary }]
    });

    // Add measurement tools without default bindings
    toolGroup.addTool('Length');
    toolGroup.addTool('Angle');
    toolGroup.addTool('RectangleROI');
    toolGroup.addTool('EllipticalROI');
    toolGroup.addTool('CircleROI');
    toolGroup.addTool('Bidirectional');
    toolGroup.addTool('Probe');

    // Add segmentation tools
    toolGroup.addTool('Brush');
    toolGroup.addTool('SegmentationDisplay');
  }

  setToolActive(groupId: string, toolName: string, options: ToolOptions = {}): void {
    try {
      const toolGroup = this.toolGroups.get(groupId);
      if (!toolGroup) {
        throw new Error(`Tool group ${groupId} not found`);
      }

      // Default to left mouse button if no bindings provided
      const defaultBindings = [{
        mouseButton: MouseBindings.Primary
      }];

      toolGroup.setToolActive(toolName, {
        bindings: options.bindings || defaultBindings
      });

      console.log(`Tool ${toolName} activated in group ${groupId}`);
    } catch (error) {
      console.error(`Error activating tool ${toolName} in group ${groupId}:`, error);
      throw error;
    }
  }

  setToolPassive(groupId: string, toolName: string): void {
    try {
      const toolGroup = this.toolGroups.get(groupId);
      if (!toolGroup) {
        throw new Error(`Tool group ${groupId} not found`);
      }

      toolGroup.setToolPassive(toolName);
      console.log(`Tool ${toolName} set to passive in group ${groupId}`);
    } catch (error) {
      console.error(`Error setting tool ${toolName} to passive in group ${groupId}:`, error);
      throw error;
    }
  }

  setToolEnabled(groupId: string, toolName: string): void {
    try {
      const toolGroup = this.toolGroups.get(groupId);
      if (!toolGroup) {
        throw new Error(`Tool group ${groupId} not found`);
      }

      toolGroup.setToolEnabled(toolName);
      console.log(`Tool ${toolName} enabled in group ${groupId}`);
    } catch (error) {
      console.error(`Error enabling tool ${toolName} in group ${groupId}:`, error);
      throw error;
    }
  }

  setToolDisabled(groupId: string, toolName: string): void {
    try {
      const toolGroup = this.toolGroups.get(groupId);
      if (!toolGroup) {
        throw new Error(`Tool group ${groupId} not found`);
      }

      toolGroup.setToolDisabled(toolName);
      console.log(`Tool ${toolName} disabled in group ${groupId}`);
    } catch (error) {
      console.error(`Error disabling tool ${toolName} in group ${groupId}:`, error);
      throw error;
    }
  }

  getToolGroup(groupId: string): Types.IToolGroup | undefined {
    return this.toolGroups.get(groupId);
  }

  removeToolGroup(groupId: string): void {
    try {
      ToolGroupManager.destroyToolGroup(groupId);
      this.toolGroups.delete(groupId);
      console.log(`Tool group ${groupId} removed`);
    } catch (error) {
      console.error(`Error removing tool group ${groupId}:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export const toolManagerService = ToolManagerService.getInstance(); 