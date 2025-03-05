"use client";

import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { annotationManagerService, AnnotationMetadata } from '@/lib/services/cornerstone/annotationManager';

interface AnnotationManagerProps {
  toolGroupId: string;
  studyId: string;
  userId: string;
  className?: string;
  onAnnotationSelected?: (annotationId: string) => void;
}

interface AnnotationDisplay {
  id: string;
  type: string;
  locked: boolean;
  visible: boolean;
  groupId?: string;
  label?: string;
  selected: boolean;
  data: any;
}

interface GroupDisplay {
  id: string;
  name: string;
  color: string;
  count: number;
}

export function AnnotationManager({
  toolGroupId,
  studyId,
  userId,
  className,
  onAnnotationSelected
}: AnnotationManagerProps) {
  const [annotations, setAnnotations] = useState<AnnotationDisplay[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>('');
  const [groups, setGroups] = useState<GroupDisplay[]>([]);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupColor, setNewGroupColor] = useState<string>('#3B82F6');
  
  // Initialize and load annotations
  useEffect(() => {
    const initializeAnnotations = async () => {
      // Initialize the annotation manager
      await annotationManagerService.initialize(toolGroupId);
      
      // Load existing annotations if available
      await loadAnnotations();
    };
    
    initializeAnnotations();
    
    // Set up interval to refresh annotations periodically (every 5 seconds)
    const intervalId = setInterval(() => {
      refreshAnnotations();
    }, 5000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [toolGroupId, studyId]);
  
  const loadAnnotations = async () => {
    try {
      // Load annotations from the backend if studyId is provided
      if (studyId) {
        await annotationManagerService.loadAnnotations(toolGroupId, studyId);
      }
      
      // Update the UI
      refreshAnnotations();
    } catch (error) {
      console.error('Error loading annotations:', error);
    }
  };
  
  const refreshAnnotations = () => {
    try {
      // Get all annotations from the service
      const allAnnotations = annotationManagerService.getAnnotations(toolGroupId);
      const selectedAnnotations = annotationManagerService.getSelectedAnnotations(toolGroupId);
      
      // Convert to display format
      const annotationsForDisplay = allAnnotations.map(annotation => {
        // Get custom metadata from the annotation object directly
        // Since we don't have a direct method to access metadata
        const customMetadata = annotation.metadata || {};
        
        return {
          id: annotation.annotationUID,
          type: customMetadata.toolName || 'Unknown',
          locked: false, // Default value
          visible: true, // Default value
          groupId: undefined,
          label: customMetadata.label || '',
          selected: selectedAnnotations.includes(annotation.annotationUID),
          data: annotation
        };
      });
      
      setAnnotations(annotationsForDisplay);
      
      // Extract groups (simplified approach)
      const groupsMap = new Map<string, GroupDisplay>();
      
      // Collect group IDs and create group displays
      const groupIds = new Set<string>();
      
      annotationsForDisplay.forEach(annotation => {
        if (annotation.groupId) {
          groupIds.add(annotation.groupId);
        }
      });
      
      // Create group displays
      groupIds.forEach(groupId => {
        const groupAnnotations = annotationsForDisplay.filter(a => a.groupId === groupId);
        
        groupsMap.set(groupId, {
          id: groupId,
          name: `Group ${groupId.substring(0, 5)}...`,
          color: '#3B82F6',
          count: groupAnnotations.length
        });
      });
      
      setGroups(Array.from(groupsMap.values()));
    } catch (error) {
      console.error('Error refreshing annotations:', error);
    }
  };
  
  const handleSelectAnnotation = (annotationId: string) => {
    setSelectedAnnotationId(annotationId);
    
    if (onAnnotationSelected) {
      onAnnotationSelected(annotationId);
    }
    
    // Select in the service
    annotationManagerService.selectAnnotation(toolGroupId, annotationId);
    refreshAnnotations();
  };
  
  const toggleVisibility = (annotationId: string, isVisible: boolean) => {
    if (isVisible) {
      annotationManagerService.showAnnotation(toolGroupId, annotationId);
    } else {
      annotationManagerService.hideAnnotation(toolGroupId, annotationId);
    }
    
    refreshAnnotations();
  };
  
  const toggleLock = (annotationId: string, isLocked: boolean) => {
    if (isLocked) {
      annotationManagerService.lockAnnotation(toolGroupId, annotationId);
    } else {
      annotationManagerService.unlockAnnotation(toolGroupId, annotationId);
    }
    
    refreshAnnotations();
  };
  
  const deleteAnnotation = (annotationId: string) => {
    annotationManagerService.deleteAnnotation(toolGroupId, annotationId);
    
    if (selectedAnnotationId === annotationId) {
      setSelectedAnnotationId('');
    }
    
    refreshAnnotations();
  };
  
  const addToGroup = (annotationId: string, groupId: string) => {
    annotationManagerService.addAnnotationToGroup(toolGroupId, annotationId, groupId);
    refreshAnnotations();
  };
  
  const createGroup = () => {
    if (!newGroupName) return;
    
    // Generate unique ID
    const groupId = `group-${Date.now()}`;
    
    // Create group in service (doesn't directly exist, but we can create by adding an annotation)
    if (selectedAnnotationId) {
      // Add the selected annotation to the new group
      annotationManagerService.addAnnotationToGroup(toolGroupId, selectedAnnotationId, groupId);
    }
    
    // Reset form
    setNewGroupName('');
    refreshAnnotations();
  };
  
  const saveAnnotations = async () => {
    await annotationManagerService.saveAnnotations(toolGroupId, studyId, userId);
  };
  
  return (
    <div className={cn('annotation-manager', className)}>
      <Tabs defaultValue="annotations" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="annotations">Annotations</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>
        
        <TabsContent value="annotations" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-lg font-medium">Annotations</div>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => saveAnnotations()}>
              Save
            </Button>
          </div>
          
          {annotations.length > 0 ? (
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">Type</th>
                    <th className="p-2 text-left font-medium">Group</th>
                    <th className="p-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {annotations.map(annotation => (
                    <tr 
                      key={annotation.id} 
                      className={cn(
                        'border-b', 
                        annotation.selected ? 'bg-primary/10' : '',
                        selectedAnnotationId === annotation.id ? 'bg-primary/20' : ''
                      )}
                      onClick={() => handleSelectAnnotation(annotation.id)}
                    >
                      <td className="p-2">
                        {annotation.type}
                      </td>
                      <td className="p-2">
                        {annotation.groupId ? (
                          <div className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs inline-block">
                            {groups.find(g => g.id === annotation.groupId)?.name || annotation.groupId}
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-sm">None</div>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex space-x-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleVisibility(annotation.id, !annotation.visible);
                            }}
                          >
                            {annotation.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLock(annotation.id, !annotation.locked);
                            }}
                          >
                            {annotation.locked ? <Lock size={16} /> : <Unlock size={16} />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAnnotation(annotation.id);
                            }}
                          >
                            <Trash size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No annotations found. Create annotations using the toolbar.
            </div>
          )}
          
          {selectedAnnotationId && (
            <Card className="mt-4">
              <CardBody>
                <div className="text-sm font-medium mb-2">Selected Annotation</div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Group</div>
                      <Select 
                        value={annotations.find(a => a.id === selectedAnnotationId)?.groupId || ''}
                        onValueChange={(value) => {
                          if (value) {
                            addToGroup(selectedAnnotationId, value);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map(group => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={annotations.find(a => a.id === selectedAnnotationId)?.locked}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          toggleLock(selectedAnnotationId, e.target.checked);
                        }}
                      />
                      <div className="ml-2">Locked</div>
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={annotations.find(a => a.id === selectedAnnotationId)?.visible}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          toggleVisibility(selectedAnnotationId, e.target.checked);
                        }}
                      />
                      <div className="ml-2">Visible</div>
                    </label>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="groups" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-lg font-medium">Annotation Groups</div>
          </div>
          
          <Card>
            <CardBody>
              <div className="text-sm font-medium mb-4">Create New Group</div>
              <div className="flex space-x-2 items-end">
                <div className="space-y-2 flex-1">
                  <div className="text-sm font-medium">Name</div>
                  <Input 
                    type="text" 
                    placeholder="Group name" 
                    value={newGroupName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Color</div>
                  <Input 
                    type="color" 
                    value={newGroupColor}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupColor(e.target.value)}
                    className="w-12 p-1 h-10"
                  />
                </div>
                <Button 
                  variant="default"
                  onClick={() => createGroup()}>Create</Button>
              </div>
            </CardBody>
          </Card>
          
          {groups.length > 0 ? (
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">Name</th>
                    <th className="p-2 text-left font-medium">Color</th>
                    <th className="p-2 text-left font-medium">Annotations</th>
                    <th className="p-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <tr key={group.id} className="border-b">
                      <td className="p-2">{group.name}</td>
                      <td className="p-2">
                        <div className="w-6 h-6 rounded" style={{ backgroundColor: group.color }}></div>
                      </td>
                      <td className="p-2">{group.count}</td>
                      <td className="p-2">
                        <div className="flex space-x-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Eye size={16} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Trash size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No groups created yet. Create a group and add annotations to it.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 