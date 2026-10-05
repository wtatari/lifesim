/**
 * Every "law of nature" in the simulation lives here, so the balance of the
 * ecosystem can be tuned in one place. Units: distance in μm (micrometres),
 * time in seconds of simulated time, energy in arbitrary food units.
 */
export const T = {
  /** Fixed physics step: the world thinks 30 times per simulated second. */
  dt: 1 / 30,

  // --- Bodies -------------------------------------------------------------
  /** A creature of this radius has mass 1. Mass grows with area (r²). */
  massRef: 10,
  /** Size of the energy tank per unit of mass. */
  energyPerMass: 80,
  /** Max health per √mass. */
  healthPerSqrtMass: 100,

  // --- Movement -----------------------------------------------------------
  forceBase: 40,
  forcePerMuscle: 120,
  /** Muscle force scales with mass^0.8, so big bodies are stronger but sluggish. */
  forceMassExp: 0.8,
  /** Water resistance (1/s). Terminal speed = force / (mass · drag). */
  drag: 2.0,
  /** Swimming backwards is much weaker than forwards. */
  backwardFactor: 0.4,
  /** Max turning speed (rad/s) for a creature of radius 10; smaller turn faster. */
  turnRate: 3.0,

  // --- Metabolism (energy per second) --------------------------------------
  /** Resting cost × mass^0.75 — Kleiber's law of metabolic scaling. */
  baseMetabolism: 0.3,
  /** Cost of muscle effort: × |swim| × force. */
  moveCost: 0.0045,
  /** Cost per active hidden neuron: brains are expensive. */
  brainCost: 0.014,
  /** Cost of eyes: × range(μm) × (field of view factor). */
  visionCost: 0.0004,
  /** Cost of a learning brain at full plasticity. */
  plasticityCost: 0.05,
  /** Cost of snapping the jaws, × mass^0.75. */
  biteCost: 0.5,

  // --- Food -----------------------------------------------------------------
  plantEnergy: 9,
  berryEnergy: 28,
  plantRadius: 3.6,
  berryRadius: 4.4,
  /** Seconds for a plant to grow from sprout to full size. */
  plantGrowTime: 14,
  /** Meat rots: fraction lost per second. */
  meatDecay: 0.015,
  /** Meat left behind by a corpse, per unit of mass. */
  corpsePerMass: 24,
  /** How fast meat can be eaten (energy per second). */
  meatEatRate: 30,
  /** Food is only eaten if the gut can digest at least this fraction of it. */
  minDigest: 0.12,
  /** Shape of the diet trade-off: 1 = linear, >1 = specialists favoured. */
  digestExponent: 1.2,

  // --- Combat -----------------------------------------------------------------
  biteDamage: 8,
  biteDamageDiet: 40,
  biteReach: 5,
  /** Half-angle (radians) of the cone in front of the mouth. */
  biteAngle: 0.85,
  /** Fraction of bite damage turned into energy for a meat-eater. */
  bloodGain: 0.25,

  // --- Health -----------------------------------------------------------------
  regen: 2.5,
  regenCost: 0.2,
  starveDamage: 14,
  oldAgeDamage: 7,
  toxicDamage: 16,
  toxicEnergyLoss: 8,

  // --- Reproduction ------------------------------------------------------------
  babyEnergyFill: 0.9,
  birthOverhead: 1.4,
  reproCooldown: 5,
  minParentReserve: 0.12,
  /** Energy needed to build one unit of body mass while growing up. */
  growthCost: 45,
  mateRange: 80,

  // --- Life cycle -----------------------------------------------------------------
  lifespanBase: 85,
  lifespanSize: 120,

  // --- Learning ("taste learning") ---------------------------------------------
  /** Learning rate at learning gene = 1 (change in liking per unit of reward). */
  learnMax: 1.4,
  /** Opinions fade back toward instinct with this time constant (seconds). */
  forgetTau: 90,
  likingMin: -1.5,
  likingMax: 2,
};
