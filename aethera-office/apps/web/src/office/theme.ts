export type SceneTheme = 'light' | 'dark';

export interface ScenePalette {
  background: string;
  floor: string;
  floorLine: string;
  rug: string;
  wall: string;
  wallTrim: string;
  desk: string;
  deskLeg: string;
  monitor: string;
  screen: string;
  chair: string;
  shelf: string;
  window: string;
  ambient: number;
  sun: number;
  skin: string;
}

export const PALETTES: Record<SceneTheme, ScenePalette> = {
  light: {
    background: '#efe7da',
    floor: '#e2c9a0',
    floorLine: '#cfb187',
    rug: '#c9d8e6',
    wall: '#f4efe6',
    wallTrim: '#d9cdb8',
    desk: '#fbfaf7',
    deskLeg: '#8a8f99',
    monitor: '#2b2f3a',
    screen: '#9bd3ff',
    chair: '#e76f51',
    shelf: '#b7875a',
    window: '#a9d6f5',
    ambient: 1.1,
    sun: 1.6,
    skin: '#f2c9a1',
  },
  dark: {
    background: '#100e24',
    floor: '#27234a',
    floorLine: '#332e5e',
    rug: '#3a2d6b',
    wall: '#2f2a58',
    wallTrim: '#3d3770',
    desk: '#4a4380',
    deskLeg: '#6e68a8',
    monitor: '#141226',
    screen: '#7c5cff',
    chair: '#8b5cf6',
    shelf: '#5b4a8a',
    window: '#1e3a8a',
    ambient: 0.75,
    sun: 0.9,
    skin: '#e8b98f',
  },
};

const KEY = 'aethera.sceneTheme';

export function loadSceneTheme(): SceneTheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* localStorage tidak tersedia */
  }
  return 'dark';
}

export function saveSceneTheme(t: SceneTheme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* abaikan */
  }
}
