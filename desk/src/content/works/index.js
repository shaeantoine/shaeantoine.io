import { software } from './software.js';
import { hardware } from './hardware.js';
import { workExperience } from './work.js';
import { academia } from './academia.js';

export const works = [
    ...software,
    ...academia,
    ...hardware,
    ...workExperience
];
