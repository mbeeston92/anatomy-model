"""
Stage 1a: build data/structures-proposed.csv and the numbers used in
data/structures-proposed-summary.md from the Blender inventory.

Run with ordinary Python (no Blender needed):

    python scripts/propose_structures.py

Every structure below names real Z-Anatomy objects. The script checks each
name against data/inventory.csv / data/inventory-other-objects.csv and stops
if one is missing, so the proposal cannot reference geometry that is not in
the source file.

Source-name syntax used in the CSV column `source_object_names`:
    Name.r                 the whole Z-Anatomy object
    Name.r#Tendon          only the part of the object painted with the
                           "Tendon" material in the source
    Name.r#Cartilage       only the part painted with the "Cartilage" material
    Name.r#Tendon^upper    of that painted part, only the separate pieces in
                           the upper half (by height); ^lower is the lower
                           half; ^largest is the single biggest piece
    Name.r#rest            everything in the object that no other row uses
Several objects merged into one structure are separated by " + ".
"""
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

HN = "head and neck"
SH = "shoulder"
UA = "upper arm"
EL = "elbow"
FA = "forearm"
WH = "wrist and hand"
TH = "chest and upper back (thoracic)"
LU = "abdomen and lower back (lumbar)"
PH = "pelvis and hip"
TG = "thigh"
KN = "knee"
LL = "lower leg"
AF = "ankle and foot"
REGION_ORDER = [HN, SH, UA, EL, FA, WH, TH, LU, PH, TG, KN, LL, AF]

# ------------------------------------------------------------------ inventory
INV = {}
with open(os.path.join(DATA, "inventory.csv"), encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        INV[r["object_name"]] = r
with open(os.path.join(DATA, "inventory-other-objects.csv"),
          encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        if r["type"] == "CURVE":
            INV[r["object_name"]] = r

# Objects whose left/right name in the source does not follow the usual
# ".l" / ".r" pattern. Checked against the geometry (bounding boxes).
SIDE_NAME_FIXES = {
    ("Iliocostalis colli muscle", "l"): "Iliocostalis colli muscle",
    ("Common plantar digital branches of medial plantar nerve", "r"):
        "Common plantar digital branches of medial plantar nerve",
    # The two TMJ ligament objects are labelled the wrong way round in the
    # source (the ".l" object lies on the body's right and vice versa).
    ("Lateral temporomandibular ligament", "l"):
        "Lateral temporomandibular ligament.r",
    ("Lateral temporomandibular ligament", "r"):
        "Lateral temporomandibular ligament.l",
}

ENTRIES = []   # (system, slug, [sources], plain, medical, [regions], notes, paired)


def add(system, slug, sources, plain, medical, regions, notes="", paired=True):
    if isinstance(sources, str):
        sources = [sources]
    if isinstance(regions, str):
        regions = [regions]
    ENTRIES.append((system, slug, sources, plain, medical, regions, notes, paired))


def bone(slug, src, plain, medical, regions, notes="", paired=True):
    add("bone", slug, src, plain, medical, regions, notes, paired)


def cart(slug, src, plain, medical, regions, notes="", paired=True):
    add("cartilage", slug, src, plain, medical, regions, notes, paired)


def lig(slug, src, plain, medical, regions, notes="", paired=True):
    add("ligament", slug, src, plain, medical, regions, notes, paired)


def ten(slug, src, plain, medical, regions, notes="", paired=True):
    add("tendon", slug, src, plain, medical, regions, notes, paired)


def mus(slug, src, plain, medical, regions, notes="", paired=True):
    add("muscle", slug, src, plain, medical, regions, notes, paired)


def nrv(slug, src, plain, medical, regions, notes="", paired=True):
    add("nerve", slug, src, plain, medical, regions, notes, paired)


ORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh",
       "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"]
NTH = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th",
       "11th", "12th"]

# ====================================================================== BONES
SMALL_SKULL = "Small internal skull bone; delete the row if not wanted."
bone("frontal", "Frontal bone", "Forehead bone (frontal bone)", "Os frontale", HN, paired=False)
bone("occipital", "Occipital bone", "Back of skull (occipital bone)", "Os occipitale", HN, paired=False)
bone("sphenoid", "Sphenoid bone", "Sphenoid bone (base of skull)", "Os sphenoidale", HN, paired=False)
bone("ethmoid", "Ethmoid bone", "Ethmoid bone (between the eyes)", "Os ethmoidale", HN, SMALL_SKULL, paired=False)
bone("vomer", "Vomer", "Vomer (bone of the nasal septum)", "Vomer", HN, SMALL_SKULL, paired=False)
bone("mandible", "Mandible", "Lower jaw (mandible)", "Mandibula", HN, paired=False)
bone("hyoid", "Hyoid bone", "Hyoid bone (front of neck)", "Os hyoideum", HN, paired=False)
bone("parietal", "Parietal bone", "Side of skull (parietal bone)", "Os parietale", HN)
bone("temporal", "Temporal bone", "Temple bone (temporal bone)", "Os temporale", HN)
bone("maxilla", "Maxilla", "Upper jaw (maxilla)", "Maxilla", HN)
bone("zygomatic", "Zygomatic bone", "Cheekbone (zygomatic bone)", "Os zygomaticum", HN)
bone("nasal", "Nasal bone", "Nasal bone (bridge of nose)", "Os nasale", HN)
bone("lacrimal", "Lacrimal bone", "Lacrimal bone (inner eye socket)", "Os lacrimale", HN, SMALL_SKULL)
bone("palatine", "Palatine bone", "Palatine bone (back of the roof of the mouth)", "Os palatinum", HN, SMALL_SKULL)
bone("inferior_nasal_concha", "Inferior nasal concha bone", "Inferior nasal concha (inside the nose)", "Concha nasalis inferior", HN, SMALL_SKULL)
TEETH_NOTE = ("Teeth are not bone; included (merged into one piece per side) so the "
              "skull looks complete. Delete the row if not wanted.")
bone("teeth_upper", ["Upper medial incisor", "Upper lateral incisor", "Upper canine",
                     "Upper first premolar", "Upper second premolar",
                     "Upper first molar tooth", "Upper second molar tooth"],
     "Upper teeth", "Dentes superiores", HN, TEETH_NOTE)
bone("teeth_lower", ["Lower medial incisor", "Lower lateral incisor", "Lower canine",
                     "Lower first premolar", "Lower second premolar",
                     "Lower first molar tooth", "Lower second molar tooth"],
     "Lower teeth", "Dentes inferiores", HN, TEETH_NOTE)

bone("vertebra_c1", "Atlas (C1)", "C1 vertebra (atlas)", "Atlas (C1)", HN, paired=False)
bone("vertebra_c2", "Axis (C2)", "C2 vertebra (axis)", "Axis (C2)", HN, paired=False)
for i in range(3, 8):
    bone("vertebra_c%d" % i, "Vertebra C%d" % i, "C%d vertebra (neck)" % i,
         "Vertebra cervicalis %d" % i, HN, paired=False)
for i in range(1, 13):
    bone("vertebra_t%d" % i, "Vertebra T%d" % i, "T%d vertebra (upper back)" % i,
         "Vertebra thoracica %d" % i, TH, paired=False)
for i in range(1, 6):
    bone("vertebra_l%d" % i, "Vertebra L%d" % i, "L%d vertebra (lower back)" % i,
         "Vertebra lumbalis %d" % i, LU, paired=False)
bone("sacrum", "Sacrum", "Sacrum (base of the spine)", "Os sacrum", [LU, PH], paired=False)
bone("coccyx", "Coccyx", "Tailbone (coccyx)", "Os coccygis", PH, paired=False)

bone("manubrium", "Manubrium of sternum", "Breastbone, upper part (manubrium)", "Manubrium sterni", TH, paired=False)
bone("sternum_body", "Body of sternum", "Breastbone (sternum)", "Corpus sterni", TH, paired=False)
bone("xiphoid", "Xiphoid process", "Breastbone, lower tip (xiphoid process)", "Processus xiphoideus", TH, paired=False)
for i in range(12):
    bone("rib_%d" % (i + 1), "%s rib" % ORD[i], "%s rib" % NTH[i],
         "Costa %s" % ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][i], TH)

bone("clavicle", "Clavicle", "Collarbone (clavicle)", "Clavicula", SH)
bone("scapula", "Scapula", "Shoulder blade (scapula)", "Scapula", [SH, TH],
     "High detail in source (about 25,000 triangles per side); may be simplified at export.")
bone("humerus", "Humerus", "Upper arm bone (humerus)", "Humerus", [SH, UA, EL])
bone("radius", "Radius", "Radius (forearm bone, thumb side)", "Radius", [EL, FA, WH])
bone("ulna", "Ulna", "Ulna (forearm bone, little-finger side)", "Ulna", [EL, FA, WH])
for slug, src, nm in [
        ("scaphoid", "Scaphoid bone", "Scaphoid"), ("lunate", "Lunate bone", "Lunate"),
        ("triquetrum", "Triquetrum bone", "Triquetrum"), ("pisiform", "Pisiform bone", "Pisiform"),
        ("trapezium", "Trapezium bone", "Trapezium"), ("trapezoid", "Trapezoid bone", "Trapezoid"),
        ("capitate", "Capitate bone", "Capitate"), ("hamate", "Hamate bone", "Hamate")]:
    bone(slug, src, "%s (wrist bone)" % nm, "Os " + nm.lower() if nm not in ("Lunate", "Capitate", "Hamate", "Scaphoid", "Trapezoid", "Pisiform")
         else {"Lunate": "Os lunatum", "Capitate": "Os capitatum", "Hamate": "Os hamatum",
               "Scaphoid": "Os scaphoideum", "Trapezoid": "Os trapezoideum",
               "Pisiform": "Os pisiforme"}[nm], WH)
FINGERS = ["thumb", "index finger", "middle finger", "ring finger", "little finger"]
FINGER_SLUG = ["thumb", "index", "middle", "ring", "little"]
for i in range(5):
    bone("metacarpal_%d" % (i + 1), "%s metacarpal bone" % ORD[i],
         "%s metacarpal (hand bone to the %s)" % (NTH[i], FINGERS[i]),
         "Os metacarpale %s" % ["I", "II", "III", "IV", "V"][i], WH)
PH_PLAIN = {"Proximal": "base bone", "Middle": "middle bone", "Distal": "tip bone"}
for i in range(5):
    for part in ("Proximal", "Middle", "Distal"):
        if i == 0 and part == "Middle":
            continue
        bone("phalanx_hand_%s_%s" % (FINGER_SLUG[i], part.lower()),
             "%s phalanx of %s finger of hand" % (part, ORD[i].lower()),
             "%s, %s (%s phalanx)" % (FINGERS[i].capitalize(), PH_PLAIN[part], part.lower()),
             "Phalanx %s digiti %s manus" % ({"Proximal": "proximalis", "Middle": "media", "Distal": "distalis"}[part],
                                             ["I", "II", "III", "IV", "V"][i]), WH)

bone("hip_bone", "Hip bone", "Hip bone (pelvis)", "Os coxae", PH)
bone("femur", "Femur", "Thigh bone (femur)", "Femur", [PH, TG, KN])
bone("patella", "Patella", "Kneecap (patella)", "Patella", KN)
bone("tibia", "Tibia", "Shin bone (tibia)", "Tibia", [KN, LL, AF])
bone("fibula", "Fibula", "Fibula (outer lower-leg bone)", "Fibula", [KN, LL, AF])
bone("talus", "Talus", "Talus (ankle bone)", "Talus", AF)
bone("calcaneus", "Calcaneus", "Heel bone (calcaneus)", "Calcaneus", AF)
bone("navicular", "Navicular bone", "Navicular (midfoot bone)", "Os naviculare", AF)
bone("cuboid", "Cuboid bone", "Cuboid (midfoot bone)", "Os cuboideum", AF)
bone("cuneiform_medial", "Medial cuneiform bone", "Medial cuneiform (midfoot bone)", "Os cuneiforme mediale", AF)
bone("cuneiform_intermediate", "Intermediate cuneiform bone", "Intermediate cuneiform (midfoot bone)", "Os cuneiforme intermedium", AF)
bone("cuneiform_lateral", "Lateral cuneiform bone", "Lateral cuneiform (midfoot bone)", "Os cuneiforme laterale", AF)
TOES = ["big toe", "2nd toe", "3rd toe", "4th toe", "little toe"]
TOE_SLUG = ["big", "2nd", "3rd", "4th", "little"]
for i in range(5):
    bone("metatarsal_%d" % (i + 1), "%s metatarsal bone" % ORD[i],
         "%s metatarsal (foot bone to the %s)" % (NTH[i], TOES[i]),
         "Os metatarsale %s" % ["I", "II", "III", "IV", "V"][i], AF)
for i in range(5):
    for part in ("Proximal", "Middle", "Distal"):
        if i == 0 and part == "Middle":
            continue
        bone("phalanx_foot_%s_%s" % (TOE_SLUG[i], part.lower()),
             "%s phalanx of %s finger of foot" % (part, ORD[i].lower()),
             "%s, %s (%s phalanx)" % (TOES[i].capitalize(), PH_PLAIN[part], part.lower()),
             "Phalanx %s digiti %s pedis" % ({"Proximal": "proximalis", "Middle": "media", "Distal": "distalis"}[part],
                                             ["I", "II", "III", "IV", "V"][i]), AF,
             "Source calls toes 'fingers of foot'.")
bone("sesamoids_foot", "Sesamoid bones of foot", "Sesamoid bones (under the big toe joint)", "Ossa sesamoidea pedis", AF)

# ================================================================== CARTILAGE
cart("meniscus_medial", "Medial meniscus", "Medial meniscus (inner knee cartilage)", "Meniscus medialis", KN)
cart("meniscus_lateral", "Lateral meniscus", "Lateral meniscus (outer knee cartilage)", "Meniscus lateralis", KN)
cart("labrum_hip", "Acetabular labrum", "Hip labrum (cartilage rim of the hip socket)", "Labrum acetabuli", PH)
cart("labrum_shoulder", "Glenoid labrum", "Shoulder labrum (cartilage rim of the shoulder socket)", "Labrum glenoidale", SH)
cart("tfcc_disc", "Articular disc of distal radio-ulnar joint", "Wrist cartilage disc (TFCC)", "Discus articularis radioulnaris distalis", WH,
     "Uncertain match: source has only the articular disc, not the full TFCC complex. Very simple shape in source.")
cart("disc_ac_joint", "Articular disc of acromioclavicular joint", "AC joint disc", "Discus articularis acromioclavicularis", SH, "Very simple shape in source.")
cart("disc_sc_joint", "Articular disc of sternoclavicular joint", "SC joint disc (collarbone to breastbone)", "Discus articularis sternoclavicularis", [SH, TH], "Very simple shape in source.")
cart("disc_tmj", "Articular disc of temporomandibular joint", "Jaw joint disc (TMJ)", "Discus articularis temporomandibularis", HN)
cart("pubic_symphysis", "Interpubic disc", "Pubic symphysis (cartilage joint at the front of the pelvis)", "Discus interpubicus", PH,
     "Source has two overlapping objects, 'Interpubic disc' and 'Pubic symphysis'; the disc is proposed.", paired=False)
for i in range(10):
    cart("costal_cartilage_%d" % (i + 1), "Costal cartilage of %s rib" % ORD[i].lower(),
         "Rib cartilage, %s rib (costal cartilage)" % NTH[i], "Cartilago costalis %d" % (i + 1), TH)
DISCS = (["C%d-C%d" % (i, i + 1) for i in range(2, 7)] + ["C7-T1"] +
         ["T%d-T%d" % (i, i + 1) for i in range(1, 12)] + ["T12-L1"] +
         ["L%d-L%d" % (i, i + 1) for i in range(1, 5)] + ["L5-S1"])
for d in DISCS:
    a, b = d.split("-")
    regs = []
    for lv in (a, b):
        rg = {"C": HN, "T": TH, "L": LU, "S": PH}[lv[0]]
        if rg not in regs:
            regs.append(rg)
    s = d.lower().replace("-", "_")
    cart("disc_" + s, "Intervertebral disc " + d, "%s disc (spinal disc)" % d.replace("-", "/"),
         "Discus intervertebralis " + d, regs, paired=False)
    # The separate "Nucleus pulposus" objects are deliberately not used
    # (user decision at review: disc centres are not shown separately).
AC_NOTE = ("Not a separate object in source: articular cartilage is a painted area on the bone mesh, "
           "cut out of the bone at export so it can be selected and highlighted on its own.")
cart("articular_femur_head", "Femur#Cartilage^upper", "Joint cartilage of the ball of the hip (femoral head)", "Cartilago articularis capitis femoris", PH, AC_NOTE)
cart("articular_femur_condyles", "Femur#Cartilage^lower", "Joint cartilage of the thigh bone at the knee (femoral condyles and groove)", "Cartilago articularis condylorum femoris", KN, AC_NOTE)
cart("articular_tibia_plateau", "Tibia#Cartilage^upper", "Joint cartilage of the shin bone at the knee (tibial plateau)", "Cartilago articularis condylorum tibiae", KN, AC_NOTE)
cart("articular_tibia_ankle", "Tibia#Cartilage^lower", "Joint cartilage of the shin bone at the ankle", "Cartilago articularis tibiae (facies articularis inferior)", AF, AC_NOTE)
cart("articular_patella", "Patella#Cartilage", "Joint cartilage behind the kneecap", "Cartilago articularis patellae", KN, AC_NOTE)
cart("articular_talus", "Talus#Cartilage", "Joint cartilage of the ankle bone (talus)", "Cartilago articularis tali", AF, AC_NOTE)
cart("articular_acetabulum", "Hip bone#Cartilage^largest", "Joint cartilage of the hip socket", "Facies lunata acetabuli", PH,
     AC_NOTE + " Only the socket surface; the sacroiliac and pubic joint surfaces stay part of the hip bone.")
cart("articular_humerus_head", "Humerus#Cartilage^upper", "Joint cartilage of the ball of the shoulder (humeral head)", "Cartilago articularis capitis humeri", SH, AC_NOTE)
cart("articular_humerus_elbow", "Humerus#Cartilage^lower", "Joint cartilage of the upper arm bone at the elbow", "Cartilago articularis condyli humeri", EL, AC_NOTE)
cart("articular_glenoid", "Scapula#Cartilage^largest", "Joint cartilage of the shoulder socket", "Cartilago articularis cavitatis glenoidalis", SH,
     AC_NOTE + " Only the socket surface; the small AC joint surface stays part of the shoulder blade.")
cart("articular_radius_elbow", "Radius#Cartilage^upper", "Joint cartilage of the radius at the elbow (radial head)", "Cartilago articularis capitis radii", EL, AC_NOTE)
cart("articular_radius_wrist", "Radius#Cartilage^lower", "Joint cartilage of the radius at the wrist", "Cartilago articularis radii (facies articularis carpalis)", WH, AC_NOTE)
cart("articular_ulna_elbow", "Ulna#Cartilage^upper", "Joint cartilage of the ulna at the elbow", "Cartilago articularis incisurae trochlearis", EL, AC_NOTE)
cart("articular_ulna_wrist", "Ulna#Cartilage^lower", "Joint cartilage of the ulna at the wrist", "Cartilago articularis capitis ulnae", WH, AC_NOTE)

# ================================================================== LIGAMENTS
SIMPLE = "Simple strap shape in source (thin band)."
lig("acl", "Anterior cruciate ligament", "Anterior cruciate ligament (ACL)", "Ligamentum cruciatum anterius", KN)
lig("pcl", "Posterior cruciate ligament", "Posterior cruciate ligament (PCL)", "Ligamentum cruciatum posterius", KN)
lig("mcl", ["Superficial part of tibial collateral ligament", "Deep part of tibial collateral ligament"],
    "Medial collateral ligament (MCL)", "Ligamentum collaterale tibiale", KN, "Superficial and deep parts merged.")
lig("lcl", "Fibular collateral ligament", "Lateral collateral ligament (LCL)", "Ligamentum collaterale fibulare", KN, SIMPLE)
lig("popliteofibular", "Popliteofibular ligament", "Popliteofibular ligament (back outer corner of the knee)", "Ligamentum popliteofibulare", KN)
lig("oblique_popliteal", "Oblique popliteal ligament", "Oblique popliteal ligament (back of the knee)", "Ligamentum popliteum obliquum", KN)
lig("patellar_retinaculum_medial", "Medial patellar retinaculum", "Inner kneecap stabiliser (medial patellar retinaculum)", "Retinaculum patellae mediale", KN,
    "Source has no separate MPFL; this is the nearest structure.")
lig("patellar_retinaculum_lateral", "Lateral patellar retinaculum", "Outer kneecap stabiliser (lateral patellar retinaculum)", "Retinaculum patellae laterale", KN)

lig("atfl", "Anterior talofibular ligament", "Anterior talofibular ligament (ATFL)", "Ligamentum talofibulare anterius", AF, SIMPLE)
lig("cfl", "Calcaneofibular ligament", "Calcaneofibular ligament (CFL)", "Ligamentum calcaneofibulare", AF, SIMPLE)
lig("ptfl", "Posterior talofibular ligament", "Posterior talofibular ligament (PTFL)", "Ligamentum talofibulare posterius", AF, SIMPLE)
lig("deltoid", ["Tibionavicular ligament", "Tibiocalcaneal ligament", "Posterior tibiotalar ligament"],
    "Deltoid ligament (inner ankle ligament)", "Ligamentum collaterale mediale (deltoideum)", AF,
    "Three parts merged. The anterior tibiotalar part is not in the source.")
lig("aitfl", "Anterior tibiofibular ligament", "Front syndesmosis ligament (AITFL)", "Ligamentum tibiofibulare anterius", [LL, AF])
lig("pitfl", "Posterior tibiofibular ligament", "Back syndesmosis ligament (PITFL)", "Ligamentum tibiofibulare posterius", [LL, AF])
lig("interosseous_membrane_leg", "Interosseous membrane of leg", "Membrane between the shin bones (interosseous membrane)", "Membrana interossea cruris", LL)
lig("spring", "Plantar calcaneonavicular ligament", "Spring ligament (plantar calcaneonavicular ligament)", "Ligamentum calcaneonaviculare plantare", AF, SIMPLE)
lig("long_plantar", "Long plantar ligament", "Long plantar ligament (sole of the foot)", "Ligamentum plantare longum", AF)
lig("bifurcate", ["Calcaneonavicular ligament", "Calcaneocuboid ligament"], "Bifurcate ligament (top outer midfoot)", "Ligamentum bifurcatum", AF, "Two parts merged.")
lig("lisfranc", "Cuneometatarsal interosseous ligaments", "Lisfranc ligament (midfoot)", "Ligamenta cuneometatarsalia interossea", AF,
    "Uncertain match: source groups the cuneometatarsal interosseous ligaments in one object; the Lisfranc ligament is one of them.")
lig("plantar_fascia", "Plantar aponeurosis", "Plantar fascia (sole of the foot)", "Aponeurosis plantaris", AF,
    "A fascia, filed under 'ligament' because there is no fascia system. Low detail in source.")

lig("iliofemoral", ["Descending part of iliofemoral ligament", "Transverse part of iliofemoral ligament"],
    "Iliofemoral ligament (front of hip)", "Ligamentum iliofemorale", PH, "Two parts merged.")
lig("pubofemoral", "Pubofemoral ligament", "Pubofemoral ligament (front lower hip)", "Ligamentum pubofemorale", PH)
lig("ischiofemoral", "Ischiofemoral ligament", "Ischiofemoral ligament (back of hip)", "Ligamentum ischiofemorale", PH)
lig("si_anterior", "Anterior sacro-iliac ligament", "Sacroiliac ligament, front (anterior SI ligament)", "Ligamentum sacroiliacum anterius", PH)
lig("si_posterior", "Posterior sacro-iliac ligament", "Sacroiliac ligament, back (posterior SI ligament)", "Ligamentum sacroiliacum posterius", PH)
lig("si_interosseous", "Interosseous sacro-iliac ligament", "Sacroiliac ligament, deep (interosseous SI ligament)", "Ligamentum sacroiliacum interosseum", PH)
lig("sacrotuberous", "Sacrotuberous ligament", "Sacrotuberous ligament (sacrum to sitting bone)", "Ligamentum sacrotuberale", PH)
lig("sacrospinous", "Sacrospinous ligament", "Sacrospinous ligament", "Ligamentum sacrospinale", PH)
lig("iliolumbar", "Iliolumbar ligament", "Iliolumbar ligament (lower spine to pelvis)", "Ligamentum iliolumbale", [LU, PH])
lig("inguinal", "Inguinal ligament", "Inguinal ligament (groin)", "Ligamentum inguinale", [LU, PH])

SPINE_NOTE = ("One object for the whole spine in source, so it cannot be hidden region by region "
              "unless it is cut at export.")
lig("anterior_longitudinal", "Anterior longitudinal ligament", "Front spinal ligament (anterior longitudinal ligament)", "Ligamentum longitudinale anterius", [HN, TH, LU], SPINE_NOTE, paired=False)
lig("posterior_longitudinal", "Posterior longitudinal ligament", "Back-of-disc spinal ligament (posterior longitudinal ligament)", "Ligamentum longitudinale posterius", [HN, TH, LU], SPINE_NOTE, paired=False)
lig("ligamenta_flava", "Ligamenta flava", "Ligamentum flavum (between the vertebral arches)", "Ligamenta flava", [HN, TH, LU], SPINE_NOTE, paired=False)
lig("interspinous", "Interspinous ligaments", "Interspinous ligaments (between the spinous processes)", "Ligamenta interspinalia", [HN, TH, LU], SPINE_NOTE + " Flat sheet in source.", paired=False)
lig("supraspinous", "Supraspinous ligament", "Supraspinous ligament (along the tips of the spine)", "Ligamentum supraspinale", [TH, LU], SPINE_NOTE, paired=False)
lig("nuchal", "Nuchal ligament", "Nuchal ligament (back of the neck)", "Ligamentum nuchae", HN, "Flat sheet in source.", paired=False)

lig("acromioclavicular", "Acromioclavicular ligament", "AC joint ligament (acromioclavicular ligament)", "Ligamentum acromioclaviculare", SH)
lig("coracoclavicular", ["Conoid ligament", "Trapezoid ligament"], "Coracoclavicular ligaments (conoid and trapezoid)", "Ligamentum coracoclaviculare", SH, "Two parts merged. " + SIMPLE)
lig("coracoacromial", "Coraco-acromial ligament", "Coracoacromial ligament (roof of the shoulder)", "Ligamentum coracoacromiale", SH, SIMPLE)
lig("coracohumeral", "Coracohumeral ligament", "Coracohumeral ligament", "Ligamentum coracohumerale", SH)
lig("glenohumeral_superior", "Superior glenohumeral ligament", "Superior glenohumeral ligament", "Ligamentum glenohumerale superius", SH)
lig("glenohumeral_middle", "Middle glenohumeral ligament", "Middle glenohumeral ligament", "Ligamentum glenohumerale medium", SH)
lig("glenohumeral_inferior", "Inferior glenohumeral ligament", "Inferior glenohumeral ligament", "Ligamentum glenohumerale inferius", SH)
lig("transverse_humeral", "Transverse humeral ligament", "Transverse humeral ligament (holds the biceps tendon in its groove)", "Ligamentum transversum humeri", SH)
lig("sternoclavicular_anterior", "Anterior sternoclavicular ligament", "SC joint ligament, front (anterior sternoclavicular ligament)", "Ligamentum sternoclaviculare anterius", [SH, TH])
lig("costoclavicular", "Costoclavicular ligament", "Costoclavicular ligament (collarbone to 1st rib)", "Ligamentum costoclaviculare", [SH, TH], SIMPLE)

lig("ucl_elbow", "Ulnar collateral ligament", "Ulnar collateral ligament of the elbow (UCL, inner elbow)", "Ligamentum collaterale ulnare", EL)
lig("rcl_elbow", "Radial collateral ligament", "Radial collateral ligament of the elbow (outer elbow)", "Ligamentum collaterale radiale", EL)
lig("annular", "Annular ligament of radius", "Annular ligament (ring around the head of the radius)", "Ligamentum anulare radii", EL)
lig("interosseous_membrane_forearm", "Interosseous membrane of forearm", "Membrane between the forearm bones (interosseous membrane)", "Membrana interossea antebrachii", FA)
lig("scapholunate", "Scapholunate interosseous ligament", "Scapholunate ligament (wrist)", "Ligamentum scapholunatum interosseum", WH, SIMPLE)
lig("lunotriquetral", "Lunotriquetral interosseous ligament", "Lunotriquetral ligament (wrist)", "Ligamentum lunotriquetrum interosseum", WH, SIMPLE)
lig("dorsal_radiocarpal", "Dorsal radiocarpal ligament", "Dorsal radiocarpal ligament (back of wrist)", "Ligamentum radiocarpale dorsale", WH)
lig("palmar_radiocarpal", ["Radioscaphocapitate ligament", "Radiocapitate ligament"], "Palmar radiocarpal ligaments (front of wrist)", "Ligamentum radiocarpale palmare", WH, "Two parts merged. " + SIMPLE)
lig("rcl_wrist", "Radial collateral ligament of wrist joint", "Radial collateral ligament of the wrist (thumb side)", "Ligamentum collaterale carpi radiale", WH)
lig("ucl_wrist", "Ulnar collateral ligament of wrist joint", "Ulnar collateral ligament of the wrist (little-finger side)", "Ligamentum collaterale carpi ulnare", WH)
lig("flexor_retinaculum_wrist", "Flexor retinaculum of wrist", "Carpal tunnel roof (flexor retinaculum)", "Retinaculum musculorum flexorum", WH)
lig("collateral_mcp", "Collateral metacarpophalangeal ligaments", "Knuckle collateral ligaments (MCP joints, includes thumb UCL)", "Ligamenta collateralia articulationum metacarpophalangearum", WH,
    "All five knuckles are one object in source, so the thumb UCL (skier's thumb) cannot be highlighted alone unless cut at export.")
lig("collateral_ip_hand", "Collateral interphalangeal ligaments of hand", "Finger joint collateral ligaments (PIP and DIP joints)", "Ligamenta collateralia articulationum interphalangearum manus", WH, "All fingers are one object in source.")
lig("palmar_plates", "Palmar interphalangeal ligaments", "Finger joint palmar plates (volar plates)", "Ligamenta palmaria articulationum interphalangearum", WH, "All fingers are one object in source.")
lig("tmj_lateral", "Lateral temporomandibular ligament", "Jaw joint ligament (lateral TMJ ligament)", "Ligamentum laterale articulationis temporomandibularis", HN,
    "Left and right are labelled the wrong way round in the source; assigned here by actual position.")

# ==================================================================== TENDONS
TPART = ("Not a separate object in source: this is the area of the muscle mesh that the source paints as "
         "'Tendon', cut from the muscle at export so it can be selected on its own. ")
ORIGIN_STAYS = "The tendon area at the other end of the muscle stays part of the muscle. "
ten("achilles", "Calcaneal tendon", "Achilles tendon", "Tendo calcaneus", [LL, AF])
ten("quadriceps_patellar", ["Rectus femoris muscle#Tendon^lower", "Vastus lateralis muscle#Tendon^lower", "Vastus intermedius muscle#Tendon^lower"],
    "Quadriceps tendon and patellar tendon", "Tendo musculi quadricipitis femoris; ligamentum patellae", [TG, KN],
    TPART + "The quadriceps tendon and patellar tendon are ONE continuous piece in the source and cannot be separated without cutting it by hand. "
    "Vastus medialis has no separate lower tendon piece, so its tendon stays with the muscle.")
ten("biceps_long_head", "Long head of biceps brachii#Tendon^upper", "Biceps tendon, long head (at the shoulder)", "Tendo capitis longi musculi bicipitis brachii", [SH, UA], TPART)
ten("biceps_short_head", "Short head of biceps brachii#Tendon^upper", "Biceps tendon, short head (at the shoulder)", "Tendo capitis brevis musculi bicipitis brachii", [SH, UA], TPART)
ten("biceps_distal", ["Long head of biceps brachii#Tendon^lower", "Short head of biceps brachii#Tendon^lower"], "Biceps tendon at the elbow (distal biceps tendon)", "Tendo musculi bicipitis brachii (distalis)", [UA, EL], TPART)
ten("triceps", ["Long head of triceps brachii#Tendon^lower", "Lateral head of triceps brachii#Tendon^lower", "Medial head of triceps brachii#Tendon"],
    "Triceps tendon (at the elbow)", "Tendo musculi tricipitis brachii", [UA, EL], TPART + ORIGIN_STAYS)
ten("infraspinatus", "Infraspinatus muscle#Tendon", "Rotator cuff tendon: infraspinatus", "Tendo musculi infraspinati", SH,
    TPART + "The other three rotator cuff tendons are not marked in the source (see summary).")
ten("common_extensor", "Extensor carpi radialis brevis#Tendon^upper", "Common extensor tendon at the elbow (ECRB; tennis elbow)", "Tendo musculi extensoris carpi radialis brevis (origo)", EL,
    TPART + "Uncertain match: the source has no single 'common extensor origin'. This is the elbow end of the ECRB tendon. " + ORIGIN_STAYS)
ten("common_flexor", ["Flexor carpi radialis#Tendon^upper", "Superficial head of pronator teres#Tendon^upper"], "Common flexor tendon at the elbow (golfer's elbow)", "Tendines musculorum flexorum (origo communis)", EL,
    TPART + "Uncertain match: the source has no single 'common flexor origin'. These are the elbow ends of flexor carpi radialis and pronator teres. " + ORIGIN_STAYS)
ten("finger_extensors", "Extensor digitorum#Tendon^lower", "Finger extensor tendons", "Tendines musculi extensoris digitorum", [FA, WH], TPART + ORIGIN_STAYS)
ten("finger_flexors", ["Humero-ulnar head of flexor digitorum superficialis#Tendon^lower", "Flexor digitorum profundus#Tendon^lower"],
    "Finger flexor tendons", "Tendines musculorum flexorum digitorum", [FA, WH], TPART + "Superficial and deep flexor tendons merged. " + ORIGIN_STAYS)
ten("de_quervain", ["Abductor pollicis longus#Tendon", "Extensor pollicis brevis#Tendon"], "Thumb tendons at the wrist (APL and EPB; De Quervain's tendons)",
    "Tendines musculorum abductoris pollicis longi et extensoris pollicis brevis", [FA, WH], TPART)
ten("ecu", ["Humeral head of extensor carpi ulnaris#Tendon^lower", "Ulnar head of extensor carpi ulnaris#Tendon"], "ECU tendon (little-finger side of wrist)", "Tendo musculi extensoris carpi ulnaris", [FA, WH], TPART + ORIGIN_STAYS)
ten("gluteus_medius", "Gluteus medius muscle#Tendon", "Gluteal tendon (gluteus medius)", "Tendo musculi glutei medii", PH,
    TPART + "Gluteus minimus has no tendon marked in the source.")
ten("iliopsoas", ["Psoas major#Tendon", "Iliacus muscle#Tendon"], "Hip flexor tendon (iliopsoas)", "Tendo musculi iliopsoas", PH, TPART)
ten("adductor_longus", "Adductor longus#Tendon", "Adductor tendon (adductor longus; groin)", "Tendo musculi adductoris longi", [PH, TG], TPART)
ten("hamstring_origin", ["Long head of biceps femoris#Tendon^upper", "Semitendinosus muscle#Tendon^upper", "Semimembranosus muscle#Tendon^upper"],
    "Hamstring tendons at the sitting bone (proximal hamstring tendons)", "Tendines musculorum ischiocruralium (origo)", [PH, TG], TPART + "Three tendons merged.")
ten("hamstring_biceps_femoris", ["Long head of biceps femoris#Tendon^lower", "Short head of biceps femoris#Tendon"], "Hamstring tendon at the knee: biceps femoris (outer)", "Tendo musculi bicipitis femoris", [TG, KN], TPART)
ten("hamstring_semitendinosus", "Semitendinosus muscle#Tendon^lower", "Hamstring tendon at the knee: semitendinosus (inner)", "Tendo musculi semitendinosi", [TG, KN], TPART)
ten("hamstring_semimembranosus", "Semimembranosus muscle#Tendon^lower", "Hamstring tendon at the knee: semimembranosus (inner, deep)", "Tendo musculi semimembranosi", [TG, KN], TPART)
ten("itb", "Iliotibial tract", "Iliotibial band (ITB)", "Tractus iliotibialis", [PH, TG, KN],
    "A band of fascia, filed under 'tendon'. Very high detail in source (about 48,000 triangles per side); simplified at export.")
ten("tibialis_posterior", "Tibialis posterior muscle#Tendon", "Tibialis posterior tendon (inner ankle)", "Tendo musculi tibialis posterioris", [LL, AF], TPART)
ten("tibialis_anterior", "Tibialis anterior muscle#Tendon", "Tibialis anterior tendon (front of ankle)", "Tendo musculi tibialis anterioris", [LL, AF], TPART)
ten("peroneal", ["Fibularis longus muscle#Tendon", "Fibularis brevis muscle#Tendon"], "Peroneal tendons (outer ankle)", "Tendines musculorum fibularium", [LL, AF], TPART + "Longus and brevis merged.")
ten("fhl", "Flexor hallucis longus#Tendon", "Big toe flexor tendon (FHL)", "Tendo musculi flexoris hallucis longi", [LL, AF], TPART)
ten("toe_extensors", "Tendon of extensor digitorum longus", "Toe extensor tendons (top of foot)", "Tendines musculi extensoris digitorum longi", AF)

# ==================================================================== MUSCLES
# head and neck
mus("masseter", ["Superficial part of masseter", "Deep part of masseter"], "Jaw muscle (masseter)", "Musculus masseter", HN)
mus("temporalis", "Temporalis muscle", "Temple muscle (temporalis)", "Musculus temporalis", HN)
mus("pterygoid_medial", "Medial pterygoid muscle", "Medial pterygoid (deep jaw muscle)", "Musculus pterygoideus medialis", HN)
mus("pterygoid_lateral", ["Superior head of lateral pterygoid muscle", "Inferior head of lateral pterygoid muscle"], "Lateral pterygoid (deep jaw muscle)", "Musculus pterygoideus lateralis", HN)
mus("sternocleidomastoid", "Sternocleidomastoid muscle", "Sternocleidomastoid (SCM; front-side neck muscle)", "Musculus sternocleidomastoideus", HN)
mus("scalene_anterior", "Scalenus anterior muscle", "Scalene muscle, front (anterior scalene)", "Musculus scalenus anterior", HN)
mus("scalene_middle", "Scalenus medius muscle", "Scalene muscle, middle", "Musculus scalenus medius", HN)
mus("scalene_posterior", "Scalenus posterior muscle", "Scalene muscle, back (posterior scalene)", "Musculus scalenus posterior", HN)
mus("longus_colli", "Longus colli muscle", "Deep neck flexor (longus colli)", "Musculus longus colli", HN)
mus("longus_capitis", "Longus capitis muscle", "Deep neck flexor (longus capitis)", "Musculus longus capitis", HN)
mus("suboccipitals", ["Rectus posterior major capitis muscle", "Rectus posterior minor capitis muscle", "Obliquus superior capitis muscle", "Obliquus inferior capitis muscle"],
    "Suboccipital muscles (base of skull)", "Musculi suboccipitales", HN, "Four small muscles merged.")
mus("splenius", ["Splenius capitis muscle", "Splenius colli muscle"], "Splenius (back of neck)", "Musculus splenius capitis et colli", [HN, TH])
mus("levator_scapulae", "Levator scapulae", "Levator scapulae (neck to shoulder blade)", "Musculus levator scapulae", [HN, SH])
# shoulder girdle / thorax
mus("trapezius_upper", "Descending part of trapezius muscle", "Upper trapezius", "Musculus trapezius, pars descendens", [HN, SH])
mus("trapezius_middle", "Transverse part of trapezius muscle", "Middle trapezius", "Musculus trapezius, pars transversa", [SH, TH])
mus("trapezius_lower", "Ascending part of trapezius muscle", "Lower trapezius", "Musculus trapezius, pars ascendens", [SH, TH])
mus("rhomboid_major", "Rhomboid major muscle", "Rhomboid major (between shoulder blade and spine)", "Musculus rhomboideus major", [SH, TH])
mus("rhomboid_minor", "Rhomboid minor muscle", "Rhomboid minor (between shoulder blade and spine)", "Musculus rhomboideus minor", [SH, TH])
mus("serratus_anterior", "Serratus anterior muscle", "Serratus anterior (side of the rib cage)", "Musculus serratus anterior", [SH, TH],
    "High detail in source (about 25,000 triangles per side); may be simplified at export.")
mus("pectoralis_major", ["Clavicular head of pectoralis major muscle", "Sternocostal head of pectoralis major muscle", "(Abdominal part of pectoralis major muscle)"],
    "Chest muscle (pectoralis major)", "Musculus pectoralis major", [SH, TH], "Three heads merged.")
mus("pectoralis_minor", "Pectoralis minor muscle", "Pectoralis minor (deep chest muscle)", "Musculus pectoralis minor", [SH, TH])
mus("latissimus_dorsi", "Latissimus dorsi muscle", "Latissimus dorsi (lats)", "Musculus latissimus dorsi", [SH, TH, LU])
mus("deltoid", ["Clavicular part of deltoid muscle", "Acromial part of deltoid muscle", "Scapular spinal part of deltoid muscle"],
    "Deltoid (shoulder muscle)", "Musculus deltoideus", [SH, UA], "Front, middle and back parts merged; can be kept separate if preferred.")
mus("supraspinatus", "Supraspinatus muscle", "Rotator cuff: supraspinatus", "Musculus supraspinatus", SH, "Tendon is not marked separately in source; it is part of this mesh.")
mus("infraspinatus", "Infraspinatus muscle", "Rotator cuff: infraspinatus", "Musculus infraspinatus", SH)
mus("teres_minor", "Teres minor muscle", "Rotator cuff: teres minor", "Musculus teres minor", SH, "Tendon is not marked separately in source; it is part of this mesh.")
mus("subscapularis", "Subscapularis muscle", "Rotator cuff: subscapularis", "Musculus subscapularis", SH, "Tendon is not marked separately in source; it is part of this mesh.")
mus("teres_major", "Teres major muscle", "Teres major", "Musculus teres major", SH)
mus("intercostals_external", "External intercostal muscles", "Rib muscles, outer layer (external intercostals)", "Musculi intercostales externi", TH,
    "High detail in source (about 41,000 triangles per side); will be simplified at export.")
mus("intercostals_internal", "Internal intercostal muscles", "Rib muscles, inner layer (internal intercostals)", "Musculi intercostales interni", TH,
    "High detail in source (about 40,000 triangles per side); will be simplified at export.")
mus("diaphragm", "Diaphragm", "Diaphragm (breathing muscle)", "Diaphragma", [TH, LU],
    "High detail in source (about 39,000 triangles); will be simplified at export.", paired=False)
# spine / trunk
mus("iliocostalis", ["Iliocostalis lumborum muscle", "Iliocostalis thoracis muscle", "Iliocostalis colli muscle"], "Back extensor, outer column (erector spinae: iliocostalis)", "Musculus iliocostalis", [HN, TH, LU], "Three levels merged.")
mus("longissimus", ["Longissimus thoracis muscle", "Longissimus colli muscle", "Longissimus capitis muscle"], "Back extensor, middle column (erector spinae: longissimus)", "Musculus longissimus", [HN, TH, LU], "Three levels merged.")
mus("spinalis", ["Spinalis thoracis muscle", "Spinalis colli muscle", "Spinalis capitis muscle"], "Back extensor, inner column (erector spinae: spinalis)", "Musculus spinalis", [HN, TH], "Three levels merged.")
mus("multifidus_lumbar", "Multifidus lumborum muscle", "Multifidus, lower back (deep spinal stabiliser)", "Musculus multifidus lumborum", LU)
mus("multifidus_thoracic", "Multifidus thoracis muscle", "Multifidus, upper back", "Musculus multifidus thoracis", TH)
mus("multifidus_cervical", "Multifidus colli muscle", "Multifidus, neck", "Musculus multifidus cervicis", HN)
mus("semispinalis", ["Semispinalis thoracis muscle", "Semispinalis colli muscle"], "Semispinalis (deep back and neck muscle)", "Musculus semispinalis thoracis et cervicis", [HN, TH],
    "Semispinalis capitis is not in the source.")
mus("quadratus_lumborum", "Quadratus lumborum muscle", "Quadratus lumborum (QL; deep lower-back muscle)", "Musculus quadratus lumborum", LU)
mus("rectus_abdominis", "Rectus abdominis muscle", "Abdominal muscle (rectus abdominis; 'six-pack')", "Musculus rectus abdominis", LU)
mus("external_oblique", "External abdominal oblique muscle", "External oblique (side abdominal muscle)", "Musculus obliquus externus abdominis", [TH, LU], "High detail in source (about 30,000 triangles per side); will be simplified at export.")
mus("internal_oblique", "Internal abdominal oblique muscle", "Internal oblique (side abdominal muscle)", "Musculus obliquus internus abdominis", LU, "High detail in source (about 29,000 triangles per side); will be simplified at export.")
mus("transversus_abdominis", "Transversus abdominis muscle", "Transversus abdominis (deep core muscle)", "Musculus transversus abdominis", LU, "High detail in source (about 34,000 triangles per side); will be simplified at export.")
mus("psoas_major", "Psoas major", "Psoas (deep hip flexor)", "Musculus psoas major", [LU, PH], "Psoas minor is not in the source.")
mus("iliacus", "Iliacus muscle", "Iliacus (hip flexor inside the pelvis)", "Musculus iliacus", PH)
mus("pelvic_floor", ["Pubococcygeus muscle", "Iliococcygeus muscle", "Pubo-analis muscle", "Coccygeus muscle"], "Pelvic floor muscles", "Musculus levator ani et musculus coccygeus", PH, "Four parts merged. Delete the row if not wanted.")
# arm
mus("biceps_long_head", "Long head of biceps brachii", "Biceps, long head", "Musculus biceps brachii, caput longum", [SH, UA, EL])
mus("biceps_short_head", "Short head of biceps brachii", "Biceps, short head", "Musculus biceps brachii, caput breve", [SH, UA, EL])
mus("coracobrachialis", "Coracobrachialis muscle", "Coracobrachialis", "Musculus coracobrachialis", [SH, UA])
mus("brachialis", "Brachialis muscle", "Brachialis (deep elbow flexor)", "Musculus brachialis", [UA, EL])
mus("triceps", ["Long head of triceps brachii", "Lateral head of triceps brachii", "Medial head of triceps brachii"], "Triceps", "Musculus triceps brachii", [SH, UA, EL], "Three heads merged.")
mus("anconeus", "Anconeus muscle", "Anconeus (small muscle behind the elbow)", "Musculus anconeus", EL)
# forearm
mus("brachioradialis", "Brachioradialis muscle", "Brachioradialis", "Musculus brachioradialis", [EL, FA])
mus("pronator_teres", ["Superficial head of pronator teres", "Deep head of pronator teres"], "Pronator teres", "Musculus pronator teres", [EL, FA])
mus("flexor_carpi_radialis", "Flexor carpi radialis", "Wrist flexor, thumb side (flexor carpi radialis)", "Musculus flexor carpi radialis", [EL, FA, WH])
mus("palmaris_longus", "Palmaris longus muscle", "Palmaris longus", "Musculus palmaris longus", [EL, FA, WH])
mus("flexor_carpi_ulnaris", ["Humeral head of flexor carpi ulnaris", "Ulnar head of flexor carpi ulnaris"], "Wrist flexor, little-finger side (flexor carpi ulnaris)", "Musculus flexor carpi ulnaris", [EL, FA, WH])
mus("flexor_digitorum_superficialis", ["Humero-ulnar head of flexor digitorum superficialis", "Radial head of flexor digitorum superficialis"], "Finger flexor, superficial (FDS)", "Musculus flexor digitorum superficialis", [EL, FA, WH])
mus("flexor_digitorum_profundus", "Flexor digitorum profundus", "Finger flexor, deep (FDP)", "Musculus flexor digitorum profundus", [FA, WH])
mus("flexor_pollicis_longus", "Flexor pollicis longus", "Thumb flexor (flexor pollicis longus)", "Musculus flexor pollicis longus", [FA, WH])
mus("pronator_quadratus", "Pronator quadratus", "Pronator quadratus", "Musculus pronator quadratus", FA)
mus("supinator", "Supinator", "Supinator", "Musculus supinator", [EL, FA])
mus("ecrl", "Extensor carpi radialis longus", "Wrist extensor, long (ECRL)", "Musculus extensor carpi radialis longus", [EL, FA, WH])
mus("ecrb", "Extensor carpi radialis brevis", "Wrist extensor, short (ECRB)", "Musculus extensor carpi radialis brevis", [EL, FA, WH])
mus("extensor_digitorum", "Extensor digitorum", "Finger extensor (extensor digitorum)", "Musculus extensor digitorum", [EL, FA, WH])
mus("extensor_digiti_minimi", "Extensor digiti minimi", "Little finger extensor", "Musculus extensor digiti minimi", [FA, WH])
mus("extensor_carpi_ulnaris", ["Humeral head of extensor carpi ulnaris", "Ulnar head of extensor carpi ulnaris"], "Wrist extensor, little-finger side (ECU)", "Musculus extensor carpi ulnaris", [EL, FA, WH])
mus("abductor_pollicis_longus", "Abductor pollicis longus", "Thumb abductor, long (APL)", "Musculus abductor pollicis longus", [FA, WH])
mus("extensor_pollicis_brevis", "Extensor pollicis brevis", "Thumb extensor, short (EPB)", "Musculus extensor pollicis brevis", [FA, WH])
mus("extensor_pollicis_longus", "Extensor pollicis longus", "Thumb extensor, long (EPL)", "Musculus extensor pollicis longus", [FA, WH])
mus("extensor_indicis", "Extensor indicis", "Index finger extensor", "Musculus extensor indicis", [FA, WH])
# hand
mus("thenar", ["Abductor pollicis brevis", "Superficial head of flexor pollicis brevis", "Deep head of flexor pollicis brevis", "Opponens pollicis muscle"],
    "Thumb pad muscles (thenar muscles)", "Musculi thenaris", WH, "Three muscles merged.")
mus("adductor_pollicis", ["Oblique head of adductor pollicis", "Transverse head of adductor pollicis"], "Thumb adductor (adductor pollicis)", "Musculus adductor pollicis", WH)
mus("hypothenar", ["Abductor digiti minimi of hand", "Flexor digiti minimi of hand", "Opponens digiti minimi muscle of hand"],
    "Little-finger pad muscles (hypothenar muscles)", "Musculi hypothenaris", WH, "Three muscles merged.")
mus("hand_intrinsics", ["Lumbrical muscles of hand", "Dorsal interossei muscles of hand", "Palmar interossei muscles"],
    "Small muscles between the hand bones (lumbricals and interossei)", "Musculi lumbricales et interossei manus", WH, "Merged.")
# hip and thigh
mus("gluteus_maximus", "Gluteus maximus muscle", "Buttock muscle (gluteus maximus)", "Musculus gluteus maximus", PH)
mus("gluteus_medius", "Gluteus medius muscle", "Gluteus medius (side of hip)", "Musculus gluteus medius", PH)
mus("gluteus_minimus", "Gluteus minimus muscle", "Gluteus minimus (deep side of hip)", "Musculus gluteus minimus", PH)
mus("tensor_fasciae_latae", "Tensor fasciae latae", "Tensor fasciae latae (TFL)", "Musculus tensor fasciae latae", [PH, TG])
mus("piriformis", "Piriformis muscle", "Piriformis (deep buttock muscle)", "Musculus piriformis", PH)
mus("deep_hip_rotators", ["Superior gemellus muscle", "Obturator internus", "Inferior gemellus muscle", "Quadratus femoris muscle", "Obturator externus"],
    "Deep hip rotators (gemelli, obturators, quadratus femoris)", "Musculi gemelli, obturatorii et quadratus femoris", PH, "Five muscles merged.")
mus("rectus_femoris", "Rectus femoris muscle", "Quadriceps: rectus femoris", "Musculus rectus femoris", [PH, TG, KN])
mus("vastus_lateralis", "Vastus lateralis muscle", "Quadriceps: vastus lateralis (outer)", "Musculus vastus lateralis", [TG, KN])
mus("vastus_medialis", "Vastus medialis muscle", "Quadriceps: vastus medialis (inner; VMO)", "Musculus vastus medialis", [TG, KN])
mus("vastus_intermedius", "Vastus intermedius muscle", "Quadriceps: vastus intermedius (deep)", "Musculus vastus intermedius", [TG, KN])
mus("sartorius", "Sartorius muscle", "Sartorius", "Musculus sartorius", [PH, TG, KN])
mus("gracilis", "Gracilis muscle", "Gracilis (inner thigh)", "Musculus gracilis", [PH, TG, KN])
mus("pectineus", "Pectineus muscle", "Pectineus (groin)", "Musculus pectineus", [PH, TG])
mus("adductor_longus", "Adductor longus", "Adductor longus (groin)", "Musculus adductor longus", [PH, TG])
mus("adductor_brevis", "Adductor brevis", "Adductor brevis (groin)", "Musculus adductor brevis", [PH, TG])
mus("adductor_magnus", ["Adductor magnus", "(Adductor minimus)"], "Adductor magnus (inner thigh)", "Musculus adductor magnus", [PH, TG], "Includes the small 'adductor minimus' part.")
mus("biceps_femoris", ["Long head of biceps femoris", "Short head of biceps femoris"], "Hamstring: biceps femoris (outer)", "Musculus biceps femoris", [PH, TG, KN], "Long and short heads merged.")
mus("semitendinosus", "Semitendinosus muscle", "Hamstring: semitendinosus (inner)", "Musculus semitendinosus", [PH, TG, KN])
mus("semimembranosus", "Semimembranosus muscle", "Hamstring: semimembranosus (inner, deep)", "Musculus semimembranosus", [PH, TG, KN])
# knee / lower leg
mus("popliteus", "Popliteus muscle", "Popliteus (behind the knee)", "Musculus popliteus", KN)
mus("gastrocnemius_medial", "Medial head of gastrocnemius", "Calf muscle, inner head (gastrocnemius)", "Musculus gastrocnemius, caput mediale", [KN, LL])
mus("gastrocnemius_lateral", "Lateral head of gastrocnemius", "Calf muscle, outer head (gastrocnemius)", "Musculus gastrocnemius, caput laterale", [KN, LL])
mus("soleus", "Soleus muscle", "Deep calf muscle (soleus)", "Musculus soleus", LL)
mus("plantaris", "Plantaris muscle", "Plantaris", "Musculus plantaris", [KN, LL])
mus("tibialis_anterior", "Tibialis anterior muscle", "Shin muscle (tibialis anterior)", "Musculus tibialis anterior", [LL, AF])
mus("extensor_digitorum_longus", "Extensor digitorum longus", "Toe extensor (extensor digitorum longus)", "Musculus extensor digitorum longus", [LL, AF])
mus("extensor_hallucis_longus", "Extensor hallucis longus", "Big toe extensor (extensor hallucis longus)", "Musculus extensor hallucis longus", [LL, AF])
mus("fibularis_longus", "Fibularis longus muscle", "Peroneal muscle, long (peroneus longus)", "Musculus fibularis longus", [LL, AF])
mus("fibularis_brevis", "Fibularis brevis muscle", "Peroneal muscle, short (peroneus brevis)", "Musculus fibularis brevis", [LL, AF])
mus("fibularis_tertius", "Fibularis tertius muscle", "Peroneus tertius", "Musculus fibularis tertius", [LL, AF])
mus("tibialis_posterior", "Tibialis posterior muscle", "Tibialis posterior (deep calf muscle supporting the arch)", "Musculus tibialis posterior", [LL, AF])
mus("flexor_digitorum_longus", "Flexor digitorum longus", "Toe flexor (flexor digitorum longus)", "Musculus flexor digitorum longus", [LL, AF])
mus("flexor_hallucis_longus", "Flexor hallucis longus", "Big toe flexor (flexor hallucis longus)", "Musculus flexor hallucis longus", [LL, AF])
# foot
mus("extensor_digitorum_brevis", ["Extensor digitorum brevis", "Extensor hallucis brevis"], "Short toe extensors (top of foot)", "Musculi extensor digitorum brevis et extensor hallucis brevis", AF, "Two muscles merged.")
mus("abductor_hallucis", "Abductor hallucis", "Abductor hallucis (inner arch muscle)", "Musculus abductor hallucis", AF)
mus("flexor_digitorum_brevis", "Flexor digitorum brevis", "Short toe flexor (sole of foot)", "Musculus flexor digitorum brevis", AF)
mus("abductor_digiti_minimi_foot", "Abductor digiti minimi of foot", "Abductor of the little toe (outer sole)", "Musculus abductor digiti minimi pedis", AF)
mus("foot_intrinsics_deep", ["Quadratus plantae muscle", "Lumbrical muscles of foot", "Medial head of flexor hallucis brevis", "Lateral head of flexor hallucis brevis",
                             "Oblique head of adductor hallucis", "Transverse head of adductor hallucis", "Flexor digiti minimi of foot",
                             "Dorsal interossei muscles of foot", "Plantar interossei muscles"],
    "Deep small muscles of the foot", "Musculi plantares profundi et interossei pedis", AF, "Nine small muscles merged.")

# ===================================================================== NERVES
nrv("spinal_cord", "White matter of spinal cord", "Spinal cord", "Medulla spinalis", [HN, TH, LU],
    "A mesh, not a curve. Source also has internal tracts and the dura, which are not proposed.", paired=False)
nrv("cauda_equina", "Cauda equina", "Nerve roots at the base of the spine (cauda equina)", "Cauda equina", [LU, PH],
    "This is the only object covering the lower lumbar and sacral nerve roots; individual roots (e.g. L5, S1) are not separate.", paired=False)
nrv("spinal_nerve_roots", ["Anterior root of spinal nerve", "Posterior root of spinal nerve", "Spinal ganglion"], "Spinal nerve roots", "Radices nervorum spinalium", [HN, TH, LU],
    "One object per side for all levels (neck to upper lumbar); individual roots cannot be highlighted unless cut at export. Front and back roots and ganglia merged.")
nrv("brachial_plexus", ["Roots of brachial plexus", "Superior trunk of brachial plexus", "Middle trunk of brachial plexus", "Inferior trunk of brachial plexus",
                        "Anterior division of superior trunk of brachial plexus", "Posterior division of superior trunk of brachial plexus",
                        "Anterior division of middle trunk of brachial plexus", "Posterior division of middle trunk of brachial plexus",
                        "Anterior division of inferior trunk of brachial plexus", "Posterior division of inferior trunk of brachial plexus",
                        "Posterior cord of brachial plexus"],
    "Brachial plexus (nerve network from neck to arm)", "Plexus brachialis", [HN, SH],
    "Roots, trunks, divisions and posterior cord merged. Lateral and medial cords are not separate objects in source.")
nrv("suprascapular", "Suprascapular nerve", "Suprascapular nerve", "Nervus suprascapularis", SH)
nrv("long_thoracic", "Long thoracic nerve", "Long thoracic nerve", "Nervus thoracicus longus", [SH, TH])
nrv("dorsal_scapular", "Dorsal scapular nerve", "Dorsal scapular nerve", "Nervus dorsalis scapulae", [HN, SH])
nrv("axillary", "Axillary nerve", "Axillary nerve", "Nervus axillaris", SH)
nrv("musculocutaneous", "Musculocutaneous nerve", "Musculocutaneous nerve", "Nervus musculocutaneus", [SH, UA])
nrv("median", "Median nerve", "Median nerve", "Nervus medianus", [SH, UA, EL, FA, WH])
nrv("anterior_interosseous", "Anterior interosseous nerve of forearm", "Anterior interosseous nerve (branch of median)", "Nervus interosseus antebrachii anterior", FA)
nrv("median_digital", ["Common palmar digital branches of median nerve", "Proper palmar digital branches of median nerve"], "Finger nerves from the median nerve (digital nerves)", "Nervi digitales palmares nervi mediani", WH)
nrv("ulnar", "Ulnar nerve", "Ulnar nerve", "Nervus ulnaris", [SH, UA, EL, FA, WH])
nrv("ulnar_hand", ["Superficial branch of ulnar nerve", "Deep branch of ulnar nerve", "Common palmar digital branches of ulnar nerve", "Proper palmar digital branches of ulnar nerve"],
    "Ulnar nerve branches in the hand", "Rami nervi ulnaris (manus)", WH, "Merged.")
nrv("radial", "Radial nerve", "Radial nerve", "Nervus radialis", [SH, UA, EL])
nrv("radial_superficial", "Superficial branch of radial nerve", "Radial nerve, superficial branch (back of hand sensation)", "Ramus superficialis nervi radialis", [EL, FA, WH])
nrv("posterior_interosseous", ["Deep branch of radial nerve", "Posterior interosseous nerve of forearm"], "Posterior interosseous nerve (deep branch of radial)", "Nervus interosseus antebrachii posterior", [EL, FA])
nrv("femoral", "Femoral nerve", "Femoral nerve", "Nervus femoralis", [LU, PH, TG])
nrv("saphenous", "Saphenous nerve", "Saphenous nerve (inner leg sensation)", "Nervus saphenus", [TG, KN, LL, AF])
nrv("lateral_femoral_cutaneous", "Lateral femoral cutaneous nerve", "Lateral femoral cutaneous nerve (outer thigh sensation)", "Nervus cutaneus femoris lateralis", [PH, TG])
nrv("obturator", ["Obturator nerve", "Anterior branch of obturator nerve", "Posterior branch of obturator nerve"], "Obturator nerve", "Nervus obturatorius", [PH, TG])
nrv("superior_gluteal", "Superior gluteal nerve", "Superior gluteal nerve", "Nervus gluteus superior", PH, "Inferior gluteal nerve is not in the source.")
nrv("pudendal", "Pudendal nerve", "Pudendal nerve", "Nervus pudendus", PH)
nrv("posterior_femoral_cutaneous", "Posterior femoral cutaneous nerve", "Posterior femoral cutaneous nerve (back of thigh sensation)", "Nervus cutaneus femoris posterior", [PH, TG])
nrv("sciatic", "Sciatic nerve", "Sciatic nerve", "Nervus ischiadicus", [PH, TG])
nrv("tibial", "Tibial nerve", "Tibial nerve", "Nervus tibialis", [KN, LL, AF])
nrv("common_fibular", "Common fibular nerve", "Common peroneal nerve", "Nervus fibularis communis", [KN, LL])
nrv("deep_fibular", "Deep fibular nerve", "Deep peroneal nerve", "Nervus fibularis profundus", [LL, AF])
nrv("superficial_fibular", "Superficial fibular nerve", "Superficial peroneal nerve", "Nervus fibularis superficialis", [LL, AF])
nrv("sural", "Sural nerve", "Sural nerve (outer ankle sensation)", "Nervus suralis", [LL, AF])
nrv("medial_plantar", "Medial plantar nerve", "Medial plantar nerve (sole of foot)", "Nervus plantaris medialis", AF)
nrv("lateral_plantar", "Lateral plantar nerve", "Lateral plantar nerve (sole of foot)", "Nervus plantaris lateralis", AF)
nrv("plantar_digital", ["Common plantar digital branches of medial plantar nerve", "Common plantar digital branches of lateral plantar nerve",
                        "Proper plantar digital branches of medial plantar nerve", "Proper plantar digital branches of lateral plantar nerve"],
    "Toe nerves (plantar digital nerves; Morton's neuroma site)", "Nervi digitales plantares", AF, "Merged.")


# ==================================================================== BURSAE
# Added at review: the user asked for the bursae of the shoulder, hip and knee.
def bur(slug, src, plain, medical, regions, notes=""):
    add("bursa", slug, src, plain, medical, regions, notes, True)


bur("subacromial", "Subacromial bursa", "Subacromial bursa (under the tip of the shoulder)", "Bursa subacromialis", SH)
bur("subdeltoid", "Subdeltoid bursa", "Subdeltoid bursa (under the deltoid)", "Bursa subdeltoidea", SH)
bur("subcutaneous_acromial", "Subcutaneous acromial bursa", "Bursa over the tip of the shoulder (subcutaneous acromial bursa)", "Bursa subcutanea acromialis", SH)
bur("coracobrachial", "Coracobrachial bursa", "Coracobrachial bursa (front of shoulder)", "Bursa musculi coracobrachialis", SH)
bur("infraspinatus", "Subtendinous bursa of infraspinatus muscle", "Bursa under the infraspinatus tendon", "Bursa subtendinea musculi infraspinati", SH)
bur("teres_major", "Subtendinous bursa of teres major muscle", "Bursa under the teres major tendon", "Bursa subtendinea musculi teretis majoris", SH)
bur("trapezius", "Subtendinous bursa of trapezius muscle", "Bursa under the trapezius (over the shoulder blade spine)", "Bursa subtendinea musculi trapezii", SH)

bur("trochanteric_gluteus_maximus", "Trochanteric bursa of gluteus maximus muscle", "Trochanteric bursa (outer hip, under gluteus maximus)", "Bursa trochanterica musculi glutei maximi", PH)
bur("trochanteric_gluteus_medius", "Trochanteric bursa of gluteus medius muscle", "Trochanteric bursa (outer hip, under gluteus medius)", "Bursa trochanterica musculi glutei medii", PH)
bur("trochanteric_gluteus_minimus", "Trochanteric bursa of gluteus minimus muscle", "Trochanteric bursa (outer hip, under gluteus minimus)", "Bursa trochanterica musculi glutei minimi", PH)
bur("trochanteric_subcutaneous", "Subcutaneous trochanteric bursa", "Bursa over the outer hip bone (subcutaneous trochanteric bursa)", "Bursa subcutanea trochanterica", PH)
bur("iliopectineal", "(Iliopectineal bursa)", "Iliopsoas bursa (front of hip)", "Bursa iliopectinea", PH, "Source name is 'Iliopectineal bursa'; this is the bursa usually called the iliopsoas bursa. Please confirm the plain name.")
bur("iliacus", "Subtendinous bursa of iliacus muscle", "Bursa under the iliacus tendon (front of hip)", "Bursa subtendinea iliaca", PH)
bur("ischial", "Sciatic bursa of gluteus maximus muscle", "Ischial bursa (over the sitting bone)", "Bursa ischiadica musculi glutei maximi", PH, "Source name is 'Sciatic bursa of gluteus maximus'; this is the ischiogluteal bursa. Please confirm the plain name.")
bur("obturator_internus_ischial", "Sciatic bursa of obturator internus", "Bursa of obturator internus at the sitting bone", "Bursa ischiadica musculi obturatorii interni", PH)
bur("obturator_internus_subtendinous", "Subtendinous bursa of obturator internus", "Bursa under the obturator internus tendon", "Bursa subtendinea musculi obturatorii interni", PH)
bur("piriformis", "Bursa of piriformis muscle", "Piriformis bursa", "Bursa musculi piriformis", PH)
bur("intermuscular_gluteal", "Intermuscular gluteal bursae", "Bursae between the buttock muscles", "Bursae intermusculares musculorum gluteorum", [PH, TG])
bur("biceps_femoris_superior", "Superior bursa of biceps femoris muscle", "Bursa under the top of the hamstring (biceps femoris)", "Bursa musculi bicipitis femoris superior", [PH, TG])

bur("suprapatellar", "Suprapatellar bursa", "Suprapatellar bursa (pouch above the kneecap)", "Bursa suprapatellaris", [TG, KN])
bur("prepatellar_subcutaneous", "Subcutaneous prepatellar bursa", "Prepatellar bursa (in front of the kneecap, under the skin)", "Bursa subcutanea prepatellaris", KN)
bur("prepatellar_subfascial", "Subfacial prepatellar bursa", "Prepatellar bursa (in front of the kneecap, middle layer)", "Bursa subfascialis prepatellaris", KN, "Spelt 'Subfacial' in the source.")
bur("prepatellar_subtendinous", "Subtendinous prepatellar bursa", "Prepatellar bursa (in front of the kneecap, deep layer)", "Bursa subtendinea prepatellaris", KN)
bur("infrapatellar_subcutaneous", "Subcutaneous infrapatellar bursa", "Superficial infrapatellar bursa (below the kneecap, under the skin)", "Bursa subcutanea infrapatellaris", KN)
bur("infrapatellar_deep", "Deep infrapatellar bursa", "Deep infrapatellar bursa (behind the patellar tendon)", "Bursa infrapatellaris profunda", KN)
bur("tibial_tuberosity", "Subcutaneous bursa of tuberosity of tibia", "Bursa over the bump below the knee (tibial tuberosity)", "Bursa subcutanea tuberositatis tibiae", KN)
bur("pes_anserine", "Anserine bursa", "Pes anserine bursa (inner knee)", "Bursa anserina", KN)
bur("sartorius", "Subtendinous bursa of sartorius muscle", "Bursa under the sartorius tendon (inner knee)", "Bursae subtendineae musculi sartorii", KN)
bur("semimembranosus", "Semimembranosus bursa", "Semimembranosus bursa (back inner knee; Baker's cyst site)", "Bursa musculi semimembranosi", KN)
bur("biceps_femoris_inferior", "Inferior subtendinous bursa of biceps femoris muscle", "Bursa under the hamstring tendon (outer knee)", "Bursa subtendinea musculi bicipitis femoris inferior", KN)
bur("gastrocnemius_medial", "Medial subtendinous bursa of gastrocnemius muscle", "Bursa under the inner calf muscle head (back of knee)", "Bursa subtendinea musculi gastrocnemii medialis", KN)
bur("gastrocnemius_lateral", "Lateral subtendinous bursa of gastrocnemius muscle", "Bursa under the outer calf muscle head (back of knee)", "Bursa subtendinea musculi gastrocnemii lateralis", KN)


# ============================================================== build the CSV
def resolve(base, side):
    """Return the real Z-Anatomy object name for a base name and side."""
    if side is None:
        return base
    if (base, side) in SIDE_NAME_FIXES:
        return SIDE_NAME_FIXES[(base, side)]
    return "%s.%s" % (base, side)


def mat_counts(row):
    out = {}
    for part in (row.get("triangles_by_material") or "").split("|"):
        if ":" in part:
            k, v = part.rsplit(":", 1)
            out[k] = out.get(k, 0) + int(v)
    return out


def tri_count(obj_name, subset):
    """Approximate triangle count from the inventory (exact numbers come
    from the export report). '^upper/^lower/^largest' pieces are counted as
    the whole painted area, and '#rest' as the whole object."""
    row = INV[obj_name]
    if row["type"] == "CURVE":
        return int(row["triangles_if_converted_to_mesh"])
    total = int(row["triangles_after_modifiers"])
    if subset is None or subset == "rest":
        return total
    return mat_counts(row).get(subset.split("^")[0], 0)


# Objects that have a painted part used by another structure: the row that
# names the whole object gets "#rest" (everything not used elsewhere).
claimed = set()
for system, slug, sources, *_ in ENTRIES:
    for s_ in sources:
        if "#" in s_:
            claimed.add(s_.split("#")[0])

rows = []
errors = []
seen_ids = set()
used_objects = {}
for system, slug, sources, plain, medical, regions, notes, paired in ENTRIES:
    for side in (("l", "r") if paired else (None,)):
        sid = "%s_%s" % (system, slug) + ("_" + side if side else "")
        if sid in seen_ids:
            errors.append("duplicate id " + sid)
        seen_ids.add(sid)
        names = []
        tris = 0
        extra = []
        for s in sources:
            base, subset = (s.split("#") + [None])[:2]
            if subset is None and base in claimed:
                subset = "rest"                     # e.g. muscle minus tendon
            obj = resolve(base, side)
            if obj not in INV:
                errors.append("%s: source object not found: %r" % (sid, obj))
                continue
            t = tri_count(obj, subset)
            if t == 0:
                errors.append("%s: %r %s has no triangles" % (sid, obj, subset or ""))
            tris += t
            key = (obj, subset)
            if key in used_objects:
                errors.append("%s: %r used twice (also in %s)" % (sid, key, used_objects[key]))
            used_objects[key] = sid
            names.append(obj + ("#" + subset if subset else ""))
            row = INV[obj]
            geo = row.get("side_from_geometry") or row.get("side")
            want = {"l": "left", "r": "right", None: "midline"}[side]
            if geo and geo != want and not (want != "midline" and geo == "midline"):
                extra.append("CHECK: geometry of %r lies on the %s" % (obj, geo))
        n = notes
        if system == "nerve" and any(INV.get(resolve(s.split("#")[0], side), {}).get("type") == "CURVE" for s in sources):
            n = (n + " " if n else "") + "Drawn as a curve (line) in source; becomes a thin tube at export."
        if extra:
            n = (n + " " if n else "") + " ".join(extra)
        rows.append({
            "id": sid,
            "source_object_names": " + ".join(names),
            "plain_name_uk": plain,
            "medical_name": medical,
            "system": system,
            "side": {"l": "left", "r": "right", None: "midline"}[side],
            "regions": "|".join(sorted(regions, key=REGION_ORDER.index)),
            "notes": n.strip(),
            "_tris": tris,
        })

if errors:
    print("PROBLEMS:")
    for e in errors:
        print("  " + e)
    sys.exit(1)

FIELDS = ["id", "source_object_names", "plain_name_uk", "medical_name",
          "system", "side", "regions", "notes"]
with open(os.path.join(DATA, "structures-proposed.csv"), "w", newline="",
          encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)

# ------------------------------------------------------------------ the stats
SYSTEMS = ["bone", "cartilage", "ligament", "tendon", "muscle", "nerve", "bursa"]
stats = {
    "total_structures": len(rows),
    "total_triangles": sum(r["_tris"] for r in rows),
    "source_objects_used": len({k[0] for k in used_objects}),
    "by_system": {s: {"structures": sum(1 for r in rows if r["system"] == s),
                      "triangles": sum(r["_tris"] for r in rows if r["system"] == s)}
                  for s in SYSTEMS},
    "by_region": {g: {s: sum(1 for r in rows if r["system"] == s and g in r["regions"].split("|"))
                      for s in SYSTEMS} for g in REGION_ORDER},
    "by_side": {s: sum(1 for r in rows if r["side"] == s) for s in ("left", "right", "midline")},
    "soft_tissue_triangles_right_side_only": sum(r["_tris"] for r in rows if r["system"] != "bone" and r["side"] == "right"),
    "soft_tissue_structures_right_side_only": sum(1 for r in rows if r["system"] != "bone" and r["side"] == "right"),
    "heaviest": sorted(((r["_tris"], r["id"]) for r in rows), reverse=True)[:15],
}
print(json.dumps(stats, indent=1))
