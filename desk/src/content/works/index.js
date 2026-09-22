import { software } from './software.js';
import { hardware } from './hardware.js';
import { workExperience } from './work.js';
import { academia } from './academia.js';

/**
 * Every Work on the desk, in no particular order — each category's own file
 * owns the sequence its object steps through, since that is a per-object
 * decision (the monitor leads with what is current, the lanyard with the most
 * recent job, the paper stack with the piece whose method I would most defend).
 *
 * main.js validates this whole list at load and validateDeskLayout cross-checks
 * it against the desk layout, so a category with no object — or an object with
 * no category — fails on the first page view rather than silently rendering an
 * empty focus session.
 */
export const works = [
    ...software,
    ...academia,
    ...hardware,
    ...workExperience
];
