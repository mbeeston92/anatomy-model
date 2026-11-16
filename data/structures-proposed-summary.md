# Proposed structures: summary (Stage 1a)

> **Out of date in places.** This is the Stage 1a proposal as first written
> (762 structures). The current list has **817 structures**: disc centres were
> removed, 64 bursae were added, and in Stage 1b several tendons and joint
> cartilages were split into their separate pieces. The `source_object_names`
> syntax also changed. See `PROGRESS.md` for the current state.

This goes with `data/structures-proposed.csv`. Nothing has been exported yet.
All numbers come from `data/inventory.csv`, which was read straight from the
Z-Anatomy file by `blender/inventory.py`.

## Headline numbers

| | |
|---|---|
| Structures proposed | **762** (335 left, 335 right, 92 midline) |
| Z-Anatomy objects used | 882 (some structures merge several objects) |
| Triangles if exported exactly as the source has them | about **2.73 million** |
| Estimated download, compressed, with no simplification | about **15–25 MB** |
| Estimated download after simplifying the over-detailed items | about **8–14 MB** |

The download sizes are estimates from typical compression ratios. They will be
measured properly in Stage 1b. Both are inside the 40 MB target.

## Counts by system

| System | Structures | Triangles |
|---|---:|---:|
| Bone | 208 | 551,000 |
| Cartilage | 101 | 183,000 |
| Ligament | 116 | 106,000 |
| Tendon | 48 | 217,000 |
| Muscle | 225 | 1,339,000 |
| Nerve | 64 | 333,000 |
| **Total** | **762** | **2,729,000** |

## Counts by region

A structure that spans several regions is counted in each one, so the columns
add up to more than 762. Left and right are counted separately.

| Region | Bone | Cartilage | Ligament | Tendon | Muscle | Nerve |
|---|---:|---:|---:|---:|---:|---:|
| Head and neck | 34 | 14 | 7 | 0 | 38 | 7 |
| Shoulder | 6 | 10 | 20 | 6 | 40 | 18 |
| Upper arm | 2 | 0 | 0 | 6 | 12 | 8 |
| Elbow | 6 | 6 | 6 | 10 | 32 | 10 |
| Forearm | 4 | 0 | 2 | 12 | 38 | 10 |
| Wrist and hand | 58 | 6 | 20 | 12 | 38 | 10 |
| Chest and upper back (thoracic) | 41 | 48 | 9 | 0 | 35 | 5 |
| Abdomen and lower back (lumbar) | 6 | 12 | 9 | 0 | 21 | 6 |
| Pelvis and hip | 6 | 9 | 20 | 14 | 38 | 15 |
| Thigh | 2 | 0 | 0 | 12 | 28 | 12 |
| Knee | 8 | 10 | 16 | 10 | 26 | 6 |
| Lower leg | 4 | 0 | 6 | 10 | 26 | 12 |
| Ankle and foot | 58 | 4 | 22 | 12 | 28 | 16 |

## How to read the `source_object_names` column

| Written as | Means |
|---|---|
| `Femur.r` | the whole Z-Anatomy object |
| `A.r + B.r` | several objects merged into one structure |
| `Rectus femoris muscle.r#Tendon` | only the part of that object the source colours as tendon |
| `Femur.r#Cartilage` | only the part the source colours as cartilage |
| `Femur.r#!Cartilage` | the object with that part taken out |

The `#` rows use geometry that is already in the source. Nothing is drawn or
invented; the mesh is only cut along the colour boundary the Z-Anatomy authors
painted. I have not looked at these cuts yet, so each needs a visual check in
Stage 1b before you rely on it.

## Structures you would expect that are NOT in the source as separate objects

**Tendons**
- **Patellar tendon (patellar ligament).** No object of its own. It appears to
  be part of the tendon area of the quadriceps meshes (rectus femoris reaches
  below the kneecap). Proposed as one combined "Quadriceps tendon and patellar
  tendon"; I will try to separate the two in Stage 1b.
- **Rotator cuff tendons of supraspinatus, subscapularis and teres minor.** The
  source marks no tendon area on these three muscles; only infraspinatus has
  one. They can be selected only as whole muscles.
- **Common extensor origin and common flexor origin.** No single object. The
  nearest are the tendon areas of ECRB (extensor side) and of flexor carpi
  radialis plus pronator teres (flexor side). Each includes the whole tendon,
  not just the elbow end.
- **Gluteus minimus tendon, gluteus maximus tendon, piriformis tendon.** Not
  marked.
- Almost every other tendon exists only as a coloured area of its muscle. Only
  the Achilles tendon and the toe-extensor tendons are objects of their own.

**Ligaments and joint structures**
- **Anterior tibiotalar part of the deltoid ligament.** Missing. The other
  three parts are there.
- **MPFL.** Missing. The medial patellar retinaculum is the nearest thing.
- **Anterolateral ligament of the knee.** Missing.
- **Facet (zygapophysial) joint capsules.** Missing.
- **Full TFCC.** Only the articular disc is there, and it is a very simple
  shape.
- **Thumb UCL on its own.** All knuckle collateral ligaments are one object.
- **Alar and transverse ligaments of the upper neck.** Missing.

**Cartilage**
- **Articular cartilage.** No separate objects anywhere. It exists only as a
  coloured area on each bone. Proposed as cut-outs for nine major bones (femur,
  tibia, patella, talus, hip socket, humerus, shoulder socket, radius, ulna). On
  every other bone the cartilage stays part of the bone and simply shows in the
  cartilage colour.

**Nerves**
- **Individual lumbar and sacral nerve roots (L4, L5, S1 and so on).** Not
  separate. There is one "spinal nerve roots" object per side covering the neck
  to the upper lumbar spine, and one "cauda equina" object below that.
- **Lumbar plexus and sacral plexus as objects.** Missing. The named nerves
  that come out of them (femoral, obturator, sciatic and so on) are there.
- **Inferior gluteal nerve.** Missing.
- **Lateral and medial cords of the brachial plexus.** Missing (the posterior
  cord, trunks, divisions and roots are there).

**Muscles**
- **Semispinalis capitis.** Missing.
- **Psoas minor.** Missing.
- **Articularis genus.** Only its attachment marks exist, not the muscle.

## Naming and grouping choices I am unsure about

Please check these when you review the CSV.

1. **Merged muscles.** These are one structure each: deltoid (3 parts),
   triceps (3 heads), pectoralis major (3 parts), biceps femoris (2 heads),
   each erector spinae column (3 levels), suboccipitals (4), thenar (3),
   hypothenar (3), hand lumbricals and interossei, deep hip rotators (5),
   deep foot muscles (9), pelvic floor (4). Tell me if you want any split.
2. **Kept separate.** Upper, middle and lower trapezius; long and short head
   of biceps; inner and outer gastrocnemius; the four quadriceps; lumbar,
   thoracic and neck multifidus.
3. **"Peroneal" versus "fibular".** I used "peroneal" in the plain names
   (peroneal tendons, common peroneal nerve) because UK patients usually hear
   that, with "fibularis" in the medical name.
4. **Phalanges.** Named as "Index finger, middle bone (middle phalanx)" and
   "Big toe, tip bone (distal phalanx)".
5. **Spinal discs.** Each level has two rows: the disc, and its soft centre
   (nucleus pulposus). Delete the 23 `disc_nucleus_` rows if you do not want
   the centre shown separately.
6. **Systems that do not fit neatly.** Iliotibial band is filed under
   "tendon". Plantar fascia, interosseous membranes, flexor retinaculum (carpal
   tunnel roof) and patellar retinacula are filed under "ligament".
7. **Teeth and small internal skull bones** are included so the skull looks
   complete. Rows are marked so you can delete them.
8. **Spinal ligaments** (anterior and posterior longitudinal, ligamentum
   flavum, interspinous, supraspinous) are each one object for the whole spine,
   so hiding one region cannot hide just that part unless I cut them at export.
9. **Jaw joint ligament.** Left and right are labelled the wrong way round in
   the source. I assigned them by where they actually are.
10. **Pubic symphysis.** The source has two overlapping objects. I chose
    "Interpubic disc".
11. **Uncertain matches**, marked in the notes column: Lisfranc ligament, TFCC
    disc, MPFL substitute, common extensor and flexor tendons.

## In the source but left out of the proposal

Say if you want any of these added.

- **Bursae (78 objects).** Subacromial, subdeltoid, trochanteric, prepatellar,
  infrapatellar, pes anserine, retrocalcaneal and more. Clinically useful, but
  the brief has no "bursa" system, so I left them out and am asking.
- Joint capsules (hip, knee, shoulder, elbow, wrist, fingers, toes). They
  would hide the ligaments and cartilage underneath.
- Infrapatellar fat pad.
- Tendon sheaths; ankle and wrist extensor retinacula; fascia (fascia lata,
  thoracolumbar, crural and others).
- Small ligaments of the wrist, hand and foot beyond the main ones; minor knee
  ligaments (meniscotibial, transverse, arcuate); costovertebral ligaments;
  ligament of the head of the femur.
- Facial, eye, tongue, throat and voice-box muscles; innermost intercostals;
  rotatores, interspinales and other very small spinal muscles.
- Cranial nerves, intercostal nerves, sympathetic trunk, and most skin
  (cutaneous) nerve branches.
- Ear ossicles, voice-box and nose cartilages.
- Muscle attachment marks (origin and insertion footprints).
- Everything out of scope: organs, blood vessels, lymph nodes, skin, brain,
  eye.

## Triangle count and what it means

- The whole Z-Anatomy file is about 4.1 million triangles as stored, and about
  11.5 million once its modifiers are applied and its curves (nerves and
  blood vessels) are turned into tubes. That is far too heavy for a laptop
  browser.
- The proposal uses about 2.73 million. A laptop with integrated graphics can
  display that, but rotation may not stay smooth, so I recommend bringing it
  down to roughly 1.2–1.5 million in Stage 1b.
- Most of the saving comes from a handful of over-detailed items that would
  look the same with far fewer triangles:

| Item | Triangles (both sides) |
|---|---:|
| Iliotibial band | 97,000 |
| External intercostals | 83,000 |
| Internal intercostals | 80,000 |
| Transversus abdominis | 69,000 |
| External oblique | 59,000 |
| Internal oblique | 58,000 |
| Serratus anterior | 50,000 |
| Scapula | 51,000 |
| Diaphragm | 39,000 |

- Nerves are drawn as lines in the source and become round tubes at export.
  Using fewer sides on each tube would cut the 333,000 nerve triangles by half
  or more with no visible change.
- Many ligaments are the opposite: very simple flat straps (some only a dozen
  triangles). They are anatomically placed but will look plain close up. This
  is how the source is, and I will not embellish them.
