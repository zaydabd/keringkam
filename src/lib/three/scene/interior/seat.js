// The seats' sizes, on their own (no three.js), so the cloth that lies on them (drape.js) can be
// worked out in a Worker or in Node.

/**
 * The seats' proportions after C1 (estimated from the photo), in metres. buildSeat builds from
 * them and seatReach() measures the footprint from them, so the overlap check follows the model.
 */
export const SEAT = {
  height: 0.44, // top of the seat slats
  armTop: 0.64, // top of the turned front post: the arm's scroll ends on it
  armJoin: 0.7, // where the arm meets the back post
  inset: 0.03, // the legs and posts stand this far in from the seat's edges
  lean: 0.1, // the back leans back by this much (radians) above the seat
  frontLeg: 0.026, // turned front leg's largest radius
  backPost: [0.045, 0.038], // square back post above the seat: width, depth
  backLeg: [0.045, 0.04, 0.045], // raked back leg: width, depth, and how far back its foot sits
  arm: [0.016, 0.022, 0.006], // arm section: half-thickness, half-width, corner cut
  scroll: 0.035, // the arm's scroll reaches this far past the front post
  crest: { below: 0.13, peak: 0.14, setteePeak: 0.15, overhang: 0.0225, bevel: 0.004 }, // the crest rail: bottom below `back`, arch height, past the posts, edge bevel
};
