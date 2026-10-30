/**
 * The categories, and the object on the desk that each one was entered through
 * on the original site. Nothing routes by category now (the site's #hash
 * routes go to modules); the labels survive in the base layout
 * (content/deskObjects.js), and the category keys in the work data
 * (content/works/).
 *
 * THE CUT IS BY MEDIUM, NOT BY EMPLOYER. A résumé sorts by institution and
 * date because that is the only ordering a single sheet of paper can carry. A
 * desk cannot sort that way — there is no object that means "2023" — so these
 * are cut by what the thing physically *is*: something that ran on a screen
 * (`software`, read off the display), something printed (`academia`, the
 * stapled run of printouts), something you could pick up (`hardware`, the
 * breadboard), a job you held (`work`, the badge on the lanyard). Four
 * mediums, and four objects on the desk to enter them through. That is why the
 * Apple work appeared under `software` and the Apple *job* under `work`, and
 * why those were two different entries rather than one.
 */
export const CATEGORY_LABELS = {
    software: 'Software',
    hardware: 'Hardware',
    work: 'Work',
    academia: 'Academia'
};
