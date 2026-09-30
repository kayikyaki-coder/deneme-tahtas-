import * as intro from './intro.js';
import * as kinetic from './kinetic.js';
import * as grid from './grid.js';
import * as depth from './depth.js';
import * as liquid from './liquid.js';
import * as particles from './particles.js';
import * as rapid from './rapid.js';
import * as outro from './outro.js';
import { C } from '../util.js';
import { W, H } from '../timeline.js';

const placeholder = (color, label) => ({
  draw(L, tl) {
    const ctx = L.ctx();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color === C.paper || color === C.lime ? C.ink : C.paper;
    ctx.font = '900 120px Archivo';
    ctx.textAlign = 'center';
    ctx.fillText(label + ' ' + tl.toFixed(2), W / 2, H / 2 + 40);
  },
});

export const SCENES = {
  intro,
  kinetic,
  grid,
  depth,
  liquid,
  particles,
  rapid,
  outro,
};

export const SHADERS = { liquid: liquid.SHADER, liquidField: liquid.FIELD };
