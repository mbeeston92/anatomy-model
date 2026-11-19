// Anatomical muscle depth layers for the "Peel back a layer" control:
//   1 = superficial (outer layer, peeled off first)
//   2 = intermediate (middle layer, peeled off second)
//   3 = deep (deepest stabilisers, peeled off third)
// Everything else defaults to layer 2 if a new muscle is added later.

const SUPERFICIAL = new Set([
  // Head & neck
  'muscle_masseter',
  'muscle_temporalis',
  'muscle_sternocleidomastoid',
  'muscle_trapezius_upper',
  // Shoulder & back
  'muscle_deltoid',
  'muscle_pectoralis_major',
  'muscle_latissimus_dorsi',
  'muscle_trapezius_middle',
  'muscle_trapezius_lower',
  // Trunk / abdomen
  'muscle_rectus_abdominis',
  'muscle_external_oblique',
  'muscle_intercostals_external',
  // Arm, forearm & hand
  'muscle_biceps_long_head',
  'muscle_biceps_short_head',
  'muscle_triceps',
  'muscle_anconeus',
  'muscle_brachioradialis',
  'muscle_pronator_teres',
  'muscle_flexor_carpi_radialis',
  'muscle_palmaris_longus',
  'muscle_flexor_carpi_ulnaris',
  'muscle_ecrl',
  'muscle_extensor_digitorum',
  'muscle_extensor_digiti_minimi',
  'muscle_extensor_carpi_ulnaris',
  'muscle_thenar',
  'muscle_hypothenar',
  // Pelvis, hip & thigh
  'muscle_gluteus_maximus',
  'muscle_tensor_fasciae_latae',
  'muscle_sartorius',
  'muscle_rectus_femoris',
  'muscle_gracilis',
  'muscle_biceps_femoris',
  'muscle_semitendinosus',
  // Lower leg & foot
  'muscle_gastrocnemius_medial',
  'muscle_gastrocnemius_lateral',
  'muscle_tibialis_anterior',
  'muscle_fibularis_longus',
  'muscle_extensor_digitorum_brevis',
  'muscle_abductor_hallucis',
  'muscle_flexor_digitorum_brevis',
  'muscle_abductor_digiti_minimi_foot',
]);

const DEEP = new Set([
  // Head & neck
  'muscle_pterygoid_medial',
  'muscle_pterygoid_lateral',
  'muscle_longus_colli',
  'muscle_longus_capitis',
  'muscle_suboccipitals',
  'muscle_multifidus_cervical',
  // Shoulder & back
  'muscle_supraspinatus',
  'muscle_infraspinatus',
  'muscle_teres_minor',
  'muscle_subscapularis',
  'muscle_multifidus_thoracic',
  'muscle_multifidus_lumbar',
  'muscle_quadratus_lumborum',
  // Trunk / abdomen / pelvis floor
  'muscle_transversus_abdominis',
  'muscle_diaphragm',
  'muscle_psoas_major',
  'muscle_iliacus',
  'muscle_pelvic_floor',
  // Arm, forearm & hand
  'muscle_flexor_digitorum_profundus',
  'muscle_flexor_pollicis_longus',
  'muscle_pronator_quadratus',
  'muscle_supinator',
  'muscle_adductor_pollicis',
  'muscle_hand_intrinsics',
  // Pelvis, hip & thigh
  'muscle_gluteus_minimus',
  'muscle_piriformis',
  'muscle_deep_hip_rotators',
  'muscle_vastus_intermedius',
  'muscle_adductor_brevis',
  'muscle_adductor_magnus',
  // Lower leg & foot
  'muscle_popliteus',
  'muscle_tibialis_posterior',
  'muscle_flexor_digitorum_longus',
  'muscle_flexor_hallucis_longus',
  'muscle_foot_intrinsics_deep',
]);

export const PEEL_LABELS = [
  'All muscles',
  'Intermediate & deep',
  'Deep only',
  'No muscles',
];

/** Layer depth for a muscle structure id: 1 (superficial), 2 (intermediate), or 3 (deep). */
export function muscleLayer(id) {
  const base = id.replace(/_[lr]$/, '');
  if (SUPERFICIAL.has(base)) return 1;
  if (DEEP.has(base)) return 3;
  return 2;
}
