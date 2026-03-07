export interface DAWaypointSnapshot {
  id: string;
  x: number;
  y: number;
  isSelected: boolean;
}

export interface DALabelSnapshot {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  isSelected: boolean;
}

export interface DANodeSnapshot {
  id: string;
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
  fontSize: number;
  isSelected: boolean;
}

export interface DAEdgeSnapshot {
  id: string;
  srcNodeId: string;
  destNodeId: string;
  isSelected: boolean;
  waypoints: DAWaypointSnapshot[];
  labels: DALabelSnapshot[];
}

export interface GraphSnapshot {
  nodes: DANodeSnapshot[];
  edges: DAEdgeSnapshot[];
}
