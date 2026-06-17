import { Injectable, signal } from '@angular/core';
import { GraphSnapshot } from '../drawing-area/graph-snapshot';

export interface SavedGraph {
  id: string;
  name: string;
  data: GraphSnapshot;
  savedAt: string;
}

const STORAGE_KEY = 'kidraw_named_graphs_v1';

@Injectable({ providedIn: 'root' })
export class GraphStorageService {
  private _graphs = signal<SavedGraph[]>(this.loadAll());
  readonly graphs = this._graphs.asReadonly();

  save(name: string, data: GraphSnapshot): string {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: SavedGraph = { id, name, data, savedAt: new Date().toISOString() };
    this._graphs.update(list => [...list, entry]);
    this.persist();
    return id;
  }

  update(id: string, data: GraphSnapshot): void {
    this._graphs.update(list =>
      list.map(g => g.id === id ? { ...g, data, savedAt: new Date().toISOString() } : g)
    );
    this.persist();
  }

  rename(id: string, name: string): void {
    this._graphs.update(list => list.map(g => g.id === id ? { ...g, name } : g));
    this.persist();
  }

  delete(id: string): void {
    this._graphs.update(list => list.filter(g => g.id !== id));
    this.persist();
  }

  get(id: string): SavedGraph | undefined {
    return this._graphs().find(g => g.id === id);
  }

  private loadAll(): SavedGraph[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SavedGraph[];
    } catch {
      return [];
    }
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._graphs()));
  }
}
