import { hashString } from './util.js';

export const THEMES = [
  {
    id: 'deepspace',
    name: 'Deep Space',
    bg: '#020409',
    fog: { color: '#020409', density: 0.00085 },
    stars: { color: '#cfe0ff', count: 5200 },
    palette: ['#6ea8ff', '#7ef0d4', '#c792ea', '#82aaff', '#89ddff', '#f2c97d', '#f78c6c', '#a3f7bf'],
    hub: '#ffffff',
    att: '#5c6b84',
    linkOpacity: 0.5,
    bloom: { strength: 1.05, radius: 0.55, threshold: 0.12 },
    hemi: ['#3a4a7a', '#0a0d1a', 1.4],
    dive: {
      zenith: '#050a18', horizon: '#0e2036', deep: '#02060d',
      aurora: ['#3ef2b0', '#4aa8ff', '#b06bff'],
      letter: '#ffffff',
      bloom: { strength: 1.35, radius: 0.6, threshold: 0.1 },
    },
  },
  {
    id: 'nebula',
    name: 'Nebula',
    bg: '#0b0414',
    fog: { color: '#1a0b2a', density: 0.00125 },
    stars: { color: '#ffd9ec', count: 4200 },
    palette: ['#ff7edb', '#ffb86b', '#b892ff', '#7bd5ff', '#ff6b9d', '#ffe66d', '#8affc1', '#d78cff'],
    hub: '#fff2ae',
    att: '#6e5a86',
    linkOpacity: 0.55,
    bloom: { strength: 1.35, radius: 0.7, threshold: 0.08 },
    hemi: ['#7a3a8a', '#140a20', 1.6],
    dive: {
      zenith: '#12041f', horizon: '#3a1140', deep: '#08020f',
      aurora: ['#ff7edb', '#b892ff', '#59d4ff'],
      letter: '#ffe9f6',
      bloom: { strength: 1.5, radius: 0.7, threshold: 0.08 },
    },
  },
];

export function folderColor(theme, folder, folders) {
  const i = folders.indexOf(folder);
  const n = theme.palette.length;
  const idx = i >= 0 ? i % n : hashString(folder) % n;
  return theme.palette[idx];
}
