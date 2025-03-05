import { annotation, Types, utilities } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';
import * as cornerstone3D from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { cornerstoneService } from '@/lib/services/cornerstoneService';
import { toolManagerService } from '@/lib/services/cornerstone/toolManager';
import { annotationsApi } from '@/lib/api';
// Define our own Annotation interface instead of importing from an invalid path
export interface Annotation {
  annotationUID: string;
  metadata?: {
    toolName?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Filter for getting annotations
export interface AnnotationFilter {
  toolName?: string;
  viewportId?: string;
  toolGroupId?: string;
  annotationId?: string;
}

// Metadata for annotations
export interface AnnotationMetadata {
  studyId: string;
  userId: string;
  isLocked?: boolean;
  isVisible?: boolean;
  label?: string;
  color?: string;
  groupId?: string;
  toolName?: string;
  annotationUID?: string;
  aiAnalysis?: string | null;
}

// State maintained for each tool group
interface AnnotationState {
  toolGroupId: string;
  selected: Set<string>;
  lockedAnnotations: Set<string>;
  hiddenAnnotations: Set<string>;
  annotationGroups: Map<string, Set<string>>;
  metadata: Map<string, AnnotationMetadata>;
}

// Import necessary types or provide type placeholders when missing
// These are placeholder types when the actual ones aren't available
interface FrameOfReferenceSpecificAnnotationManager {
  // Base interface that we'll extend
}

interface ToolGroup {
  id: string;
  // Base ToolGroup interface
}

interface ToolManagerService {
  // Base ToolManagerService interface
}

// Extended interface definitions to fix type issues
interface ExtendedAnnotationManager extends FrameOfReferenceSpecificAnnotationManager {
  addEventListener: (eventName: string, callback: (evt: any) => void) => void;
}

interface ExtendedToolGroup extends ToolGroup {
  getFrameOfReferenceUIDs: () => string[];
}

interface ExtendedToolManagerService extends ToolManagerService {
  getToolGroupState: (toolGroupId: string) => {
    viewportIds?: string[];
    [key: string]: any;
  };
}

// Extending the interfaces to handle the specific Cornerstone API structure
interface AnnotationStateMap {
  [frameOfReferenceUID: string]: {
    [toolName: string]: any[];
  };
}

interface ExtendedAnnotationState extends AnnotationState {
  getToolNames?: () => string[];
  setAnnotationSelected?: (annotationUID: string, selected: boolean) => void;
  removeAnnotation?: (annotationUID: string | any) => void;
  addAnnotation?: (toolGroupOrFrameOfReference: string, toolName: string, data?: any) => void;
  getAnnotations?: (frameOfReference: string, toolName: string) => any[];
  // Add an index signature to allow string indexing
  [key: string]: any;
}

export class AnnotationManagerService {
  private static instance: AnnotationManagerService;
  private state: Map<string, AnnotationState> = new Map();
  
  private constructor() {}
  
  static getInstance(): AnnotationManagerService {
    if (!AnnotationManagerService.instance) {
      AnnotationManagerService.instance = new AnnotationManagerService();
    }
    return AnnotationManagerService.instance;
  }
  
  async initialize(toolGroupId: string): Promise<void> {
    // Ensure Cornerstone is initialized
    await cornerstoneService.initialize();
    
    // Initialize our state
    this.ensureStateExists(toolGroupId);
    
    // Try to set up annotation event listeners
    try {
      // Use safer approach to get annotation manager and events
      // This is a compatibility fix for different Cornerstone3D versions
      const annotationManager = annotation.state.getAnnotationManager();
      
      // Define the event types we need - handle compatibility issues
      const EVENTS = {
        ANNOTATION_ADDED: 'ANNOTATION_ADDED',
        ANNOTATION_MODIFIED: 'ANNOTATION_MODIFIED',
        ANNOTATION_REMOVED: 'ANNOTATION_REMOVED',
        ANNOTATION_SELECTION_CHANGE: 'ANNOTATION_SELECTION_CHANGE'
      };
      
      // Check if the annotation manager has addEventListener method
      if (annotationManager && typeof (annotationManager as any).addEventListener === 'function') {
        console.log('AnnotationManager: Setting up event listeners');
        
        // Listen for annotation added events
        (annotationManager as unknown as ExtendedAnnotationManager).addEventListener(EVENTS.ANNOTATION_ADDED, (evt: any) => {
          console.log('Annotation added:', evt.detail);
          
          // Extract annotation from event
          const annotationUID = evt.detail.annotation.annotationUID;
          const toolName = evt.detail.annotation.metadata?.toolName;
          
          // Store in our selected set for the tool group
          if (annotationUID) {
            // Add default metadata
            this.setAnnotationMetadata(toolGroupId, annotationUID, {
              studyId: '', // Will be filled later when saving
              userId: '', // Will be filled later when saving
              toolName: toolName || '',
              isLocked: false,
              isVisible: true
            });
          }
        });
        
        // Listen for annotation selection events
        (annotationManager as unknown as ExtendedAnnotationManager).addEventListener(EVENTS.ANNOTATION_SELECTION_CHANGE, (evt: any) => {
          const selected = evt.detail.added || [];
          const deselected = evt.detail.removed || [];
          
          // Update our selected set
          selected.forEach((annotation: any) => {
            if (annotation.annotationUID) {
              this.state.get(toolGroupId)?.selected.add(annotation.annotationUID);
            }
          });
          
          deselected.forEach((annotation: any) => {
            if (annotation.annotationUID) {
              this.state.get(toolGroupId)?.selected.delete(annotation.annotationUID);
            }
          });
        });
        
        // Listen for annotation modified events
        (annotationManager as unknown as ExtendedAnnotationManager).addEventListener(EVENTS.ANNOTATION_MODIFIED, (evt: any) => {
          console.log('Annotation modified:', evt.detail);
        });
        
        // Listen for annotation removed events
        (annotationManager as unknown as ExtendedAnnotationManager).addEventListener(EVENTS.ANNOTATION_REMOVED, (evt: any) => {
          const annotationUID = evt.detail.annotation.annotationUID;
          
          // Clean up our state
          if (annotationUID) {
            // Remove from selected
            this.state.get(toolGroupId)?.selected.delete(annotationUID);
            
            // Remove from locked
            this.state.get(toolGroupId)?.lockedAnnotations.delete(annotationUID);
            
            // Remove from hidden
            this.state.get(toolGroupId)?.hiddenAnnotations.delete(annotationUID);
            
            // Remove from groups
            this.removeAnnotationFromGroup(toolGroupId, annotationUID);
            
            // Remove metadata
            this.state.get(toolGroupId)?.metadata.delete(annotationUID);
          }
        });
        
        console.log('AnnotationManager: Event listeners set up successfully');
      } else {
        console.warn('AnnotationManager: Could not set up event listeners, annotation manager or addEventListener not available');
      }
    } catch (error) {
      console.warn('AnnotationManager: Error setting up event listeners:', error);
    }
  }
  
  // Get all annotations for a specific tool group, optionally filtered
  getAnnotations(toolGroupId: string, filter?: AnnotationFilter): any[] {
    this.ensureStateExists(toolGroupId);
    
    const allAnnotations: any[] = [];
    
    try {
      // Try to get annotations from the cornerstone API
      const annotationState = annotation.state as unknown as ExtendedAnnotationState;
      
      // Get the frame of reference IDs (newer API version)
      // Try different approaches based on API version
      const frameOfReferenceUIDs: string[] = [];
      
      try {
        // First approach: Try to get all annotations
        const allToolGroups = cornerstoneTools.ToolGroupManager.getAllToolGroups();
        const toolGroup = allToolGroups.find(tg => tg.id === toolGroupId);
        
        if (toolGroup && typeof (toolGroup as any).getFrameOfReferenceUIDs === 'function') {
          frameOfReferenceUIDs.push(...(toolGroup as unknown as ExtendedToolGroup).getFrameOfReferenceUIDs());
        } else {
          // Fallback: Try to find from viewports directly
          console.log('Falling back to viewport-based frame of reference lookup');
          const toolState = (toolManagerService as unknown as ExtendedToolManagerService).getToolGroupState(toolGroupId);
          if (toolState && toolState.viewportIds) {
            // Get frame of reference from viewports
            toolState.viewportIds.forEach((vpId: string) => {
              try {
                const viewport = cornerstone3D.getEnabledElementByViewportId(vpId);
                if (viewport && viewport.FrameOfReferenceUID) {
                  frameOfReferenceUIDs.push(viewport.FrameOfReferenceUID);
                }
              } catch (err) {
                console.warn(`Error getting frame of reference for viewport ${vpId}:`, err);
              }
            });
          }
        }
        
        console.log('Frame of reference UIDs:', frameOfReferenceUIDs);
      } catch (error) {
        console.warn('Error getting frame of reference UIDs:', error);
      }
      
      if (frameOfReferenceUIDs.length > 0) {
        // For each frame of reference, get annotations
        for (const frameOfReferenceUID of frameOfReferenceUIDs) {
          try {
            // Get tool names through our own maintenance
            const toolNames = this.getToolNames();
            
            // For each tool, get its annotations
            for (const toolName of toolNames) {
              if (filter?.toolName && filter.toolName !== toolName) {
                continue;
              }
              
              try {
                // Try to get annotations in different ways based on API availability
                let toolAnnotations: any[] = [];
                
                try {
                  // Try the newest API first
                  if (typeof annotationState.getAnnotations === 'function') {
                    toolAnnotations = annotationState.getAnnotations(frameOfReferenceUID, toolName) || [];
                  } 
                  // Fallback to older API - fixed with proper casting
                  else if (annotationState[frameOfReferenceUID] && 
                           (annotationState as unknown as AnnotationStateMap)[frameOfReferenceUID][toolName]) {
                    toolAnnotations = (annotationState as unknown as AnnotationStateMap)[frameOfReferenceUID][toolName];
                  }
                } catch (err) {
                  console.warn(`Error getting annotations for tool ${toolName}:`, err);
                }
                
                if (toolAnnotations) {
                  // Convert to array format consistently
                  const annotationsArray = Object.values(toolAnnotations).flatMap(
                    annotationList => Array.isArray(annotationList) ? 
                      annotationList : 
                      [annotationList]
                  );
                  
                  // Process each annotation
                  for (const anno of annotationsArray) {
                    if (!anno) continue;
                    
                    // Filter by specific annotation ID if requested
                    if (filter?.annotationId && anno.annotationUID !== filter.annotationId) {
                      continue;
                    }
                    
                    // Add annotation to our list
                    allAnnotations.push(anno);
                  }
                }
              } catch (error) {
                console.warn(`Error processing annotations for tool ${toolName}:`, error);
              }
            }
          } catch (error) {
            console.warn(`Error processing frame of reference ${frameOfReferenceUID}:`, error);
          }
        }
      } else {
        console.warn('No frame of reference UIDs found, annotation retrieval may be incomplete');
      }
    } catch (error) {
      console.error('Error getting annotations:', error);
    }
    
    return allAnnotations;
  }
  
  // Get a list of tool names to check for annotations
  private getToolNames(): string[] {
    try {
      // This is the ideal case but may not be supported
      const annotationStateExt = annotation.state as unknown as ExtendedAnnotationState;
      if (typeof annotationStateExt.getToolNames === 'function') {
        return annotationStateExt.getToolNames();
      }
    } catch (error) {
      console.warn('getToolNames not supported, using predefined list:', error);
    }
    
    // Fallback to a predefined list of common tools
    return [
      'Length',
      'Angle',
      'RectangleROI',
      'EllipticalROI',
      'CircleROI',
      'Probe',
      'Bidirectional',
      'ArrowAnnotate',
      'CobbAngle',
      'PlanarFreehandROI'
    ];
  }
  
  // Select an annotation
  selectAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Add to our internal tracking
    this.state.get(toolGroupId)!.selected.add(annotationUID);
    
    // Try to use the annotation selection API
    try {
      if (typeof annotation.selection.setAnnotationSelected === 'function') {
        annotation.selection.setAnnotationSelected(annotationUID, true);
      } else {
        const annotationStateExt = annotation.state as unknown as ExtendedAnnotationState;
        if (typeof annotationStateExt.setAnnotationSelected === 'function') {
          // Fallback to older API if available
          annotationStateExt.setAnnotationSelected(annotationUID, true);
        }
      }
    } catch (error) {
      console.warn(`Error selecting annotation ${annotationUID}:`, error);
    }
  }
  
  // Deselect an annotation
  deselectAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Remove from our internal tracking
    this.state.get(toolGroupId)!.selected.delete(annotationUID);
    
    // Try to use the annotation selection API
    try {
      if (typeof annotation.selection.setAnnotationSelected === 'function') {
        annotation.selection.setAnnotationSelected(annotationUID, false);
      } else {
        const annotationStateExt = annotation.state as unknown as ExtendedAnnotationState;
        if (typeof annotationStateExt.setAnnotationSelected === 'function') {
          // Fallback to older API if available
          annotationStateExt.setAnnotationSelected(annotationUID, false);
        }
      }
    } catch (error) {
      console.warn(`Error deselecting annotation ${annotationUID}:`, error);
    }
  }
  
  // Get all selected annotations
  getSelectedAnnotations(toolGroupId: string): string[] {
    this.ensureStateExists(toolGroupId);
    
    // Try to get from Cornerstone3D API first if available
    try {
      if (typeof annotation.selection.getAnnotationsSelected === 'function') {
        const selected = annotation.selection.getAnnotationsSelected();
        if (Array.isArray(selected)) {
          return selected;
        }
      }
    } catch (error) {
      console.warn('Error getting selected annotations from API, using internal state:', error);
    }
    
    // Fall back to our internal tracking
    return Array.from(this.state.get(toolGroupId)!.selected);
  }
  
  // Lock an annotation to prevent editing
  lockAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Add to our internal tracking
    this.state.get(toolGroupId)!.lockedAnnotations.add(annotationUID);
    
    // Update metadata
    const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {} as AnnotationMetadata;
    metadata.isLocked = true;
    this.state.get(toolGroupId)!.metadata.set(annotationUID, metadata);
    
    // Try to use the annotation locking API if available
    try {
      if (annotation.locking && typeof annotation.locking.setAnnotationLocked === 'function') {
        // Find the annotation object first
        const annotationObj = this.findAnnotationById(toolGroupId, annotationUID);
        if (annotationObj) {
          annotation.locking.setAnnotationLocked(annotationObj, true);
        } else {
          // Try with string UID directly (some versions might accept this)
          (annotation.locking as any).setAnnotationLocked(annotationUID, true);
        }
      }
    } catch (error) {
      console.warn(`Locking API not available for annotation ${annotationUID}:`, error);
    }
  }
  
  // Unlock an annotation
  unlockAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Remove from our internal tracking
    this.state.get(toolGroupId)!.lockedAnnotations.delete(annotationUID);
    
    // Update metadata
    const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {} as AnnotationMetadata;
    metadata.isLocked = false;
    this.state.get(toolGroupId)!.metadata.set(annotationUID, metadata);
    
    // Try to use the annotation locking API if available
    try {
      if (annotation.locking && typeof annotation.locking.setAnnotationLocked === 'function') {
        // Find the annotation object first
        const annotationObj = this.findAnnotationById(toolGroupId, annotationUID);
        if (annotationObj) {
          annotation.locking.setAnnotationLocked(annotationObj, false);
        } else {
          // Try with string UID directly (some versions might accept this)
          (annotation.locking as any).setAnnotationLocked(annotationUID, false);
        }
      }
    } catch (error) {
      console.warn(`Locking API not available for annotation ${annotationUID}:`, error);
    }
  }
  
  // Hide an annotation
  hideAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Add to our internal tracking
    this.state.get(toolGroupId)!.hiddenAnnotations.add(annotationUID);
    
    // Update metadata
    const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {} as AnnotationMetadata;
    metadata.isVisible = false;
    this.state.get(toolGroupId)!.metadata.set(annotationUID, metadata);
    
    // Try to use the annotation visibility API if available
    try {
      if (annotation.visibility && typeof annotation.visibility.setAnnotationVisibility === 'function') {
        annotation.visibility.setAnnotationVisibility(annotationUID, false);
      }
    } catch (error) {
      console.warn(`Visibility API not available for annotation ${annotationUID}:`, error);
    }
  }
  
  // Show an annotation
  showAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Remove from our internal tracking
    this.state.get(toolGroupId)!.hiddenAnnotations.delete(annotationUID);
    
    // Update metadata
    const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {} as AnnotationMetadata;
    metadata.isVisible = true;
    this.state.get(toolGroupId)!.metadata.set(annotationUID, metadata);
    
    // Try to use the annotation visibility API if available
    try {
      if (annotation.visibility && typeof annotation.visibility.setAnnotationVisibility === 'function') {
        annotation.visibility.setAnnotationVisibility(annotationUID, true);
      }
    } catch (error) {
      console.warn(`Visibility API not available for annotation ${annotationUID}:`, error);
    }
  }
  
  // Add annotation to a group
  addAnnotationToGroup(toolGroupId: string, annotationUID: string, groupId: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Make sure group exists
    if (!this.state.get(toolGroupId)!.annotationGroups.has(groupId)) {
      this.state.get(toolGroupId)!.annotationGroups.set(groupId, new Set<string>());
    }
    
    // Add annotation to group
    this.state.get(toolGroupId)!.annotationGroups.get(groupId)!.add(annotationUID);
    
    // Update metadata
    const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {} as AnnotationMetadata;
    metadata.groupId = groupId;
    this.state.get(toolGroupId)!.metadata.set(annotationUID, metadata);
  }
  
  // Remove annotation from a group
  removeAnnotationFromGroup(toolGroupId: string, annotationUID: string, groupId?: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Get current group ID if not provided
    if (!groupId) {
      const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID);
      if (!metadata?.groupId) {
        // No group to remove from
        return;
      }
      
      groupId = metadata.groupId;
    }
    
    // Remove from group if exists
    if (this.state.get(toolGroupId)!.annotationGroups.has(groupId)) {
      this.state.get(toolGroupId)!.annotationGroups.get(groupId)!.delete(annotationUID);
    }
    
    // Update metadata
    const metadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {} as AnnotationMetadata;
    metadata.groupId = undefined;
    this.state.get(toolGroupId)!.metadata.set(annotationUID, metadata);
  }
  
  // Get all annotations in a group
  getAnnotationGroup(toolGroupId: string, groupId: string): string[] {
    this.ensureStateExists(toolGroupId);
    
    if (!this.state.get(toolGroupId)!.annotationGroups.has(groupId)) {
      return [];
    }
    
    return Array.from(this.state.get(toolGroupId)!.annotationGroups.get(groupId)!);
  }
  
  // Get all available annotation groups
  getAnnotationGroups(toolGroupId: string): Record<string, string[]> {
    this.ensureStateExists(toolGroupId);
    
    const result: Record<string, string[]> = {};
    
    this.state.get(toolGroupId)!.annotationGroups.forEach((annotations, groupId) => {
      result[groupId] = Array.from(annotations);
    });
    
    return result;
  }
  
  // Get metadata for an annotation
  getAnnotationMetadata(toolGroupId: string, annotationUID: string): AnnotationMetadata | undefined {
    this.ensureStateExists(toolGroupId);
    
    return this.state.get(toolGroupId)!.metadata.get(annotationUID);
  }
  
  // Set metadata for an annotation
  setAnnotationMetadata(toolGroupId: string, annotationUID: string, metadata: Partial<AnnotationMetadata>): void {
    this.ensureStateExists(toolGroupId);
    
    const existingMetadata = this.state.get(toolGroupId)!.metadata.get(annotationUID) || {
      studyId: '',
      userId: '',
      annotationUID
    } as AnnotationMetadata;
    
    // Merge new metadata with existing
    const updatedMetadata = {
      ...existingMetadata,
      ...metadata
    };
    
    this.state.get(toolGroupId)!.metadata.set(annotationUID, updatedMetadata);
  }
  
  // Delete an annotation
  deleteAnnotation(toolGroupId: string, annotationUID: string): void {
    this.ensureStateExists(toolGroupId);
    
    // Remove annotation from all of our tracking
    this.state.get(toolGroupId)!.selected.delete(annotationUID);
    this.state.get(toolGroupId)!.lockedAnnotations.delete(annotationUID);
    this.state.get(toolGroupId)!.hiddenAnnotations.delete(annotationUID);
    
    // Remove from any groups
    this.state.get(toolGroupId)!.annotationGroups.forEach((annotations) => {
      annotations.delete(annotationUID);
    });
    
    // Remove metadata
    this.state.get(toolGroupId)!.metadata.delete(annotationUID);
    
    // Use Cornerstone3D API to remove the annotation
    try {
      if (typeof annotation.state.removeAnnotation === 'function') {
        annotation.state.removeAnnotation(annotationUID);
      }
    } catch (error) {
      console.error(`Error deleting annotation ${annotationUID}:`, error);
    }
  }
  
  // Save annotations to the database
  async saveAnnotations(toolGroupId: string, studyId: string, userId: string): Promise<void> {
    this.ensureStateExists(toolGroupId);
    
    // Get all annotations
    const annotations = this.getAnnotations(toolGroupId);
    
    // Save each annotation to the server
    for (const anno of annotations) {
      // Skip annotations that are already saved or don't have UID
      if (!anno.annotationUID) {
        continue;
      }
      
      // Get metadata
      const metadata = this.state.get(toolGroupId)!.metadata.get(anno.annotationUID) || {
        studyId,
        userId,
        toolName: anno.metadata?.toolName || '',
      };
      
      // Prepare data for saving
      const data = JSON.stringify(anno);
      
      const annotationData = {
        studyId,
        userId,
        type: anno.metadata?.toolName || 'unknown',
        data,
        aiAnalysis: null
      };
      
      try {
        // Save to database via API
        await annotationsApi.create(annotationData);
      } catch (error) {
        console.error('Failed to save annotation:', error);
      }
    }
  }
  
  // Load annotations from the database
  async loadAnnotations(toolGroupId: string, studyId: string): Promise<void> {
    this.ensureStateExists(toolGroupId);
    
    try {
      // Fetch annotations from API - use correct method name
      const annotations = await annotationsApi.getByStudyId(studyId);
      
      // Clear existing annotations from our tracking
      this.state.get(toolGroupId)!.selected.clear();
      this.state.get(toolGroupId)!.lockedAnnotations.clear();
      this.state.get(toolGroupId)!.hiddenAnnotations.clear();
      this.state.get(toolGroupId)!.metadata.clear();
      
      // Clear from Cornerstone3D
      this.clearAllAnnotations(toolGroupId);
      
      // Add each annotation
      for (const annotation of annotations) {
        try {
          const data = JSON.parse(annotation.data);
          const metadata: AnnotationMetadata = {
            studyId: annotation.studyId,
            userId: annotation.userId,
            toolName: annotation.type,
            aiAnalysis: annotation.aiAnalysis,
            isLocked: false,
            isVisible: true,
          };
          
          // Try to add the annotation back to Cornerstone
          this.addAnnotationFromData(toolGroupId, data, metadata);
          
          // Apply custom metadata
          if (metadata.isLocked) {
            this.lockAnnotation(toolGroupId, data.annotationUID);
          }
          
          if (metadata.isVisible === false) {
            this.hideAnnotation(toolGroupId, data.annotationUID);
          }
          
          // Handle grouped annotations
          if ((annotation as any).groupId) {
            this.addAnnotationToGroup(toolGroupId, data.annotationUID, (annotation as any).groupId);
          }
          
          // Store metadata
          this.state.get(toolGroupId)!.metadata.set(data.annotationUID, metadata);
        } catch (error) {
          console.error('Failed to load annotation:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load annotations from API:', error);
    }
  }
  
  // Helper method to clear all annotations for a tool group
  private clearAllAnnotations(toolGroupId: string): void {
    try {
      // Get all existing annotations by tool
      const toolNames = this.getToolNames();
      toolNames.forEach(toolName => {
        const annotations = annotation.state.getAnnotations(toolGroupId, toolName);
        if (annotations) {
          // For each frame/slice
          Object.values(annotations).forEach(annotationsPerFrame => {
            // For each annotation in this frame - fix the type error by using unknown first
            ((annotationsPerFrame as unknown) as any[]).forEach(anno => {
              if (anno.annotationUID) {
                try {
                  const stateExt = annotation.state as unknown as ExtendedAnnotationState;
                  if (stateExt.removeAnnotation) {
                    stateExt.removeAnnotation(anno.annotationUID);
                  }
                } catch (err) {
                  console.warn(`Error removing annotation ${anno.annotationUID}:`, err);
                }
              }
            });
          });
        }
      });
    } catch (err) {
      console.warn(`Error clearing annotations for tool group ${toolGroupId}:`, err);
    }
  }
  
  // Helper method to add an annotation from serialized data
  private addAnnotationFromData(toolGroupId: string, data: any, metadata: AnnotationMetadata): void {
    // We need the tool name to add the annotation
    const toolName = metadata.toolName;
    if (!toolName) {
      console.error('Cannot add annotation without tool name');
      return;
    }

    try {
      const stateExt = annotation.state as unknown as ExtendedAnnotationState;
      if (typeof stateExt.addAnnotation === 'function') {
        // Handle different API signatures
        if (stateExt.addAnnotation.length === 2) {
          // Two parameter version
          stateExt.addAnnotation(toolName, data);
        } else {
          // Three parameter version
          stateExt.addAnnotation(toolGroupId, toolName, data);
        }
      } else {
        console.warn('No direct API to add annotations from data. Manual tool creation needed.');
      }
    } catch (error) {
      console.error(`Failed to add annotation for tool ${toolName}:`, error);
    }
  }
  
  // Method to find annotation by ID
  private findAnnotationById(toolGroupId: string, annotationUID: string): any {
    const annotationState = annotation.state;
    
    // Get all frame of reference UIDs for this tool group
    const frameOfReferenceUIDs: string[] = [];
    const toolNames = this.getToolNames();
    
    // Try to get frame of reference from toolGroup
    try {
      // Fix: Use ToolGroupManager.getAllToolGroups() instead of nonexistent getToolGroups()
      const allToolGroups = cornerstoneTools.ToolGroupManager.getAllToolGroups();
      const toolGroup = allToolGroups.find((tg: any) => tg.id === toolGroupId);
      
      if (toolGroup && typeof (toolGroup as any).getFrameOfReferenceUIDs === 'function') {
        frameOfReferenceUIDs.push(...(toolGroup as unknown as ExtendedToolGroup).getFrameOfReferenceUIDs());
      } else {
        // Alternative approaches to get frame of reference UIDs
        // ... existing code ...
      }
    } catch (error) {
      console.warn('Error getting frame of reference UIDs:', error);
    }
    
    // Define a cast for the annotation state to allow indexing
    const annotationStateAny = annotationState as any;
    
    // Search for the annotation UID in all tool frames
    for (const frameUID of frameOfReferenceUIDs) {
      for (const toolName of toolNames) {
        try {
          // Safely access the annotation state using indexed access
          const toolAnnotations = annotationStateAny[frameUID]?.[toolName];
          
          if (toolAnnotations) {
            for (const frameNumber in toolAnnotations) {
              // Convert the annotations to an array safely
              const annotationsInFrame = toolAnnotations[frameNumber];
              const annotationArray = Array.isArray(annotationsInFrame) 
                ? annotationsInFrame 
                : [annotationsInFrame];
              
              for (const anno of annotationArray) {
                if (anno.annotationUID === annotationUID) {
                  return anno;
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Error searching for annotation in ${toolName}:`, error);
        }
      }
    }
    
    console.warn(`Annotation with UID ${annotationUID} not found`);
    return null;
  }
  
  // Ensure state exists for a tool group
  private ensureStateExists(toolGroupId: string): void {
    if (!this.state.has(toolGroupId)) {
      this.state.set(toolGroupId, {
        toolGroupId,
        selected: new Set<string>(),
        lockedAnnotations: new Set<string>(),
        hiddenAnnotations: new Set<string>(),
        annotationGroups: new Map<string, Set<string>>(),
        metadata: new Map<string, AnnotationMetadata>()
      });
    }
  }
}

// Export a singleton instance
export const annotationManagerService = AnnotationManagerService.getInstance(); 