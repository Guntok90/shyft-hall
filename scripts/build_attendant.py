"""Previous plated figure. The hall builds the host in src/attendant.js.

This script still exports public/models/attendant.glb, which the hall does not load.

Blender Z-up. The face points down -Y. The glTF exporter maps that to +Z,
which is the face the hall turns toward the visitor.

Starts from a new file. Does not open or save logo.blend.
Run:
  blender --background --python scripts/build_attendant.py
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOGO = os.path.join(ROOT, "public", "models", "logo.glb")
OUT = os.path.join(ROOT, "public", "models", "attendant.glb")

SWATCH = {
    "teal": (43, 75, 86),
    "cream": (232, 202, 174),
    "olive": (132, 126, 100),
    "terracotta": (175, 90, 61),
    "umber": (81, 62, 48),
    "gold": (215, 177, 94),
    "joint": (28, 24, 20),
    "lens": (14, 20, 24),
}
ROUGH = {
    "teal": 0.44,
    "cream": 0.56,
    "olive": 0.50,
    "terracotta": 0.52,
    "umber": 0.46,
    "gold": 0.32,
    "joint": 0.48,
    "lens": 0.18,
}


def srgb_to_linear(channel):
    c = channel / 255.0
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def linear_rgb(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for datablock in list(block):
            if datablock.users == 0:
                block.remove(datablock)


def make_materials():
    mats = {}
    for name, rgb in SWATCH.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = linear_rgb(rgb)
        bsdf.inputs["Roughness"].default_value = ROUGH[name]
        metal = 1.0 if name == "gold" else (0.55 if name == "joint" else 0.06)
        bsdf.inputs["Metallic"].default_value = metal
        if name == "lens":
            bsdf.inputs["Emission Color"].default_value = linear_rgb((159, 212, 222))
            bsdf.inputs["Emission Strength"].default_value = 2.0
        mat.diffuse_color = linear_rgb(rgb)
        mats[name] = mat
    return mats


MATS = {}


def assign(obj, finish):
    obj.data.materials.clear()
    obj.data.materials.append(MATS[finish])
    obj["finish"] = finish


def smooth(obj):
    try:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_auto_smooth(angle=math.radians(55))
    except RuntimeError as exc:
        print("smooth", obj.name, exc)


def empty(name, parent=None, loc=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.04
    obj.location = loc
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def adopt(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def plate(name, size, loc, rot=(0.0, 0.0, 0.0), finish="cream", bevel=None, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = rot
    width = bevel if bevel is not None else min(0.007, 0.14 * min(size))
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(38)
    mod.harden_normals = True
    assign(obj, finish)
    smooth(obj)
    return obj


def cylinder_between(name, a, b, radius, finish, verts=24, bevel=0.0025):
    a = Vector(a)
    b = Vector(b)
    mid = (a + b) * 0.5
    length = max((b - a).length, 0.001)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length, location=mid)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(b - a)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = min(bevel, radius * 0.35)
    mod.segments = 2
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40)
    assign(obj, finish)
    smooth(obj)
    return obj


def sphere(name, loc, radius, finish, scale=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, finish)
    smooth(obj)
    return obj


def ring(name, loc, major, minor, rot=(0.0, 0.0, 0.0), finish="gold"):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=28,
        minor_segments=8,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.active_object
    obj.name = name
    assign(obj, finish)
    smooth(obj)
    return obj


def arc_shell(name, radius, height, z, arc_deg, center_deg, thickness, finish, bevel=0.0026):
    """Cylindrical plate. Angle 0 faces -Y (the face), 90 faces +X, 180 faces +Y."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=72, radius=radius, depth=height, location=(0.0, 0.0, z))
    obj = bpy.context.active_object
    obj.name = name
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    center = math.radians(center_deg)
    half = math.radians(arc_deg) * 0.5
    drop = []
    for face in bm.faces:
        c = face.calc_center_median()
        # Cap triangles sit near the axis. Side faces sit on the radius.
        if math.hypot(c.x, c.y) < radius * 0.55:
            drop.append(face)
            continue
        ang = math.atan2(c.x, -c.y)
        delta = (ang - center + math.pi) % math.tau - math.pi
        if abs(delta) > half:
            drop.append(face)
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    solid = obj.modifiers.new("Solid", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 1.0
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 2
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)
    mod.harden_normals = True
    assign(obj, finish)
    smooth(obj)
    return obj


def lathe(name, profile, finish):
    mesh = bpy.data.meshes.new(name + "_profile")
    bm = bmesh.new()
    verts = [bm.verts.new((radius, 0.0, z)) for radius, z in profile]
    bm.verts.ensure_lookup_table()
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    screw = obj.modifiers.new("Screw", "SCREW")
    screw.axis = "Z"
    screw.steps = 40
    screw.render_steps = 40
    screw.use_smooth_shade = True
    screw.use_merge_vertices = True
    screw.merge_threshold = 0.0004
    assign(obj, finish)
    smooth(obj)
    return obj


def realize(obj):
    """Apply modifiers, then bake the world transform into the vertices."""
    if obj.type != "MESH":
        return
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    parent = obj.parent
    obj.parent = None
    obj.matrix_world = world
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError as exc:
            print("modifier", obj.name, mod.name, exc)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return parent


def finish_of(obj):
    if "finish" in obj:
        return obj["finish"]
    lowered = obj.name.lower()
    for key in ("terracotta", "cream", "olive", "umber", "teal", "gold", "joint", "lens"):
        if key in lowered:
            return key
    return "joint"


def group_of(obj):
    cursor = obj
    while cursor is not None:
        if cursor.name == "head":
            return "head"
        cursor = cursor.parent
    return "body"


def bake_world(obj):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = matrix
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def world_bbox(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low = Vector(tuple(min(low[i], point[i]) for i in range(3)))
            high = Vector(tuple(max(high[i], point[i]) for i in range(3)))
    return low, high


def place_emblem(rig, back_y):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=LOGO)
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    for obj in meshes:
        bake_world(obj)
        finish = finish_of(obj)
        assign(obj, finish)
    low, high = world_bbox(meshes)
    center = (low + high) * 0.5
    height = max(high.z - low.z, 1e-6)
    scale = 0.105 / height
    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        for vert in bm.verts:
            vert.co = (vert.co - center) * scale
        bm.to_mesh(obj.data)
        bm.free()
    low, high = world_bbox(meshes)
    shift = Vector((
        -(low.x + high.x) * 0.5,
        back_y - high.y,
        1.355 - (low.z + high.z) * 0.5,
    ))
    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        for vert in bm.verts:
            vert.co += shift
        bm.to_mesh(obj.data)
        bm.free()
        adopt(obj, rig)
    for obj in imported:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    print(f"emblem meshes {len(meshes)} height {scale * height:.3f}")


def build_hand(side, wrist, rig):
    wrist = Vector(wrist)
    spreads = (-0.018, -0.006, 0.006, 0.018)
    palm = plate(
        f"palm_{side}",
        (0.048, 0.016, 0.052),
        (wrist.x, wrist.y - 0.012, wrist.z - 0.038),
        finish="cream",
        bevel=0.0025,
    )
    adopt(palm, rig)
    knuckle = cylinder_between(
        f"knuckle_{side}",
        (wrist.x - 0.02, wrist.y - 0.02, wrist.z - 0.062),
        (wrist.x + 0.02, wrist.y - 0.02, wrist.z - 0.062),
        0.006,
        "gold",
        verts=12,
    )
    adopt(knuckle, rig)
    for index, spread in enumerate(spreads):
        cursor = Vector((wrist.x + spread, wrist.y - 0.012, wrist.z - 0.066))
        for segment, length in enumerate((0.022, 0.018, 0.014)):
            curl = Vector((0.0, 0.006 * (segment + 1), 0.0))
            nxt = cursor + Vector((0.0, 0.0, -length)) + curl * 0.15
            finger = cylinder_between(
                f"finger_{side}_{index}_{segment}",
                cursor,
                nxt,
                0.0055 - segment * 0.0006,
                "cream",
                verts=10,
                bevel=0.001,
            )
            adopt(finger, rig)
            joint = sphere(
                f"fjoint_{side}_{index}_{segment}",
                tuple(cursor),
                0.0062 - segment * 0.0005,
                "joint",
            )
            adopt(joint, rig)
            cursor = nxt
        nail = sphere(f"nail_{side}_{index}", tuple(cursor), 0.0045, "cream", scale=(1.0, 0.7, 0.8))
        adopt(nail, rig)
    # Thumb toward the body, slightly forward so it reads from the front.
    inner = -1 if side > 0 else 1
    thumb_a = Vector((wrist.x + inner * 0.02, wrist.y - 0.02, wrist.z - 0.03))
    thumb_b = thumb_a + Vector((inner * 0.016, -0.012, -0.012))
    thumb_c = thumb_b + Vector((inner * 0.012, -0.008, -0.014))
    adopt(cylinder_between(f"thumb_a_{side}", thumb_a, thumb_b, 0.006, "cream", verts=10), rig)
    adopt(cylinder_between(f"thumb_b_{side}", thumb_b, thumb_c, 0.005, "cream", verts=10), rig)
    adopt(sphere(f"thumb_j_{side}", tuple(thumb_b), 0.0065, "joint"), rig)


def build():
    global MATS
    clear_scene()
    MATS = make_materials()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    attendant = empty("attendant")
    rig = empty("rig", attendant)
    head = empty("head", rig, (0.0, 0.0, 1.54))
    bpy.context.view_layer.update()

    suit = lathe(
        "suit",
        [
            (0.02, 0.84),
            (0.09, 0.90),
            (0.112, 0.98),
            (0.10, 1.06),
            (0.084, 1.15),
            (0.098, 1.26),
            (0.108, 1.38),
            (0.10, 1.48),
            (0.055, 1.55),
            (0.04, 1.60),
        ],
        "umber",
    )
    adopt(suit, rig)

    # Gold sits 4 mm inside a shorter outer plate, so only the rim shows.
    chest_r = 0.116
    chest_t = 0.008
    adopt(arc_shell("chest_rim", chest_r - 0.004, 0.214, 1.36, 116, 0, 0.005, "gold", 0.0014), rig)
    adopt(arc_shell("chest", chest_r, 0.196, 1.36, 104, 0, chest_t, "cream", 0.0022), rig)
    adopt(arc_shell("abdomen_rim", 0.098, 0.156, 1.16, 130, 0, 0.004, "gold", 0.0014), rig)
    adopt(arc_shell("abdomen", 0.102, 0.138, 1.16, 118, 0, 0.007, "olive", 0.002), rig)
    adopt(arc_shell("side_r", 0.110, 0.30, 1.30, 36, 78, 0.006, "olive"), rig)
    adopt(arc_shell("side_l", 0.110, 0.30, 1.30, 36, -78, 0.006, "olive"), rig)
    adopt(arc_shell("back", 0.108, 0.34, 1.30, 90, 180, 0.006, "umber"), rig)
    for index, z in enumerate((1.22, 1.30, 1.38)):
        ridge = plate(
            f"spine_{index}",
            (0.018, 0.012, 0.055),
            (0.0, 0.124, z),
            finish="teal" if index == 1 else "gold",
            bevel=0.0016,
        )
        adopt(ridge, rig)
    adopt(arc_shell("hem", 0.124, 0.12, 0.96, 230, 0, 0.009, "terracotta", 0.0022), rig)

    adopt(arc_shell("collar", 0.078, 0.062, 1.545, 230, 180, 0.007, "teal", 0.0018), rig)
    ascot = plate("ascot", (0.055, 0.016, 0.07), (0.0, -0.09, 1.50), rot=(0.35, 0.0, 0.0), finish="teal", bevel=0.002)
    adopt(ascot, rig)
    for index, z in enumerate((1.505, 1.528, 1.55)):
        adopt(ring(f"neck_{index}", (0.0, 0.0, z), 0.046, 0.0055, finish="gold" if index != 1 else "joint"), rig)

    belt = ring("belt", (0.0, 0.0, 1.045), 0.118, 0.008, finish="umber")
    adopt(belt, rig)
    pip_colors = ("teal", "cream", "olive", "terracotta", "umber")
    for index, finish in enumerate(pip_colors):
        pip = plate(
            f"pip_{finish}",
            (0.012, 0.008, 0.016),
            (-0.028 + index * 0.014, -0.122, 1.045),
            finish=finish,
            bevel=0.0012,
        )
        adopt(pip, rig)

    place_emblem(rig, -(chest_r + chest_t) - 0.001)

    # Head. Pivot is the neck empty; these meshes are parented to it.
    skull = lathe(
        "skull",
        [
            (0.012, 1.555),
            (0.055, 1.575),
            (0.086, 1.61),
            (0.10, 1.66),
            (0.098, 1.72),
            (0.07, 1.775),
            (0.02, 1.808),
        ],
        "cream",
    )
    adopt(skull, head)
    adopt(arc_shell("rear_skull", 0.103, 0.16, 1.68, 120, 180, 0.006, "umber", 0.0016), head)
    adopt(arc_shell("visor", 0.106, 0.036, 1.662, 140, 0, 0.007, "teal", 0.0016), head)
    adopt(arc_shell("glass", 0.110, 0.016, 1.660, 110, 0, 0.0035, "joint", 0.001), head)
    for side in (-1, 1):
        lens = sphere(f"lens_{'r' if side > 0 else 'l'}", (side * 0.03, -0.112, 1.661), 0.009, "lens", scale=(1.0, 0.5, 1.0))
        adopt(lens, head)
        ear = cylinder_between(
            f"ear_{side}",
            (side * 0.095, 0.0, 1.665),
            (side * 0.112, 0.0, 1.665),
            0.016,
            "gold",
            verts=16,
        )
        adopt(ear, head)
        temple = plate(
            f"temple_{side}",
            (0.01, 0.02, 0.028),
            (side * 0.1, -0.03, 1.70),
            finish="olive",
            bevel=0.0014,
        )
        adopt(temple, head)
    brow = plate("brow", (0.09, 0.016, 0.012), (0.0, -0.1, 1.688), rot=(0.25, 0.0, 0.0), finish="olive", bevel=0.0014)
    adopt(brow, head)
    for index, z in enumerate((1.628, 1.620, 1.612)):
        width = 0.034 if index == 1 else 0.024
        mouth = plate(
            "nose" if index == 1 else f"mouth_{index}",
            (width, 0.008, 0.0045),
            (0.0, -0.112, z),
            finish="joint",
            bevel=0.0008,
        )
        adopt(mouth, head)

    # Legs.
    for side in (-1, 1):
        x = side * 0.09
        adopt(cylinder_between(f"thigh_{side}", (x, 0.0, 1.02), (x, 0.0, 0.52), 0.054, "umber"), rig)
        adopt(cylinder_between(f"shin_{side}", (x, 0.0, 0.48), (x, 0.005, 0.10), 0.042, "olive"), rig)
        adopt(
            plate(
                f"thigh_panel_{side}",
                (0.01, 0.036, 0.30),
                (x + side * 0.05, -0.012, 0.76),
                finish="cream",
                bevel=0.0018,
            ),
            rig,
        )
        adopt(
            plate(
                f"shin_panel_{side}",
                (0.014, 0.01, 0.24),
                (x, -0.048, 0.30),
                finish="cream",
                bevel=0.0016,
            ),
            rig,
        )
        adopt(sphere(f"knee_{side}", (x, 0.0, 0.50), 0.05, "joint"), rig)
        adopt(ring(f"knee_ring_{side}", (x, 0.0, 0.50), 0.052, 0.007, finish="gold"), rig)
        guard = plate(
            f"knee_guard_{side}",
            (0.04, 0.012, 0.05),
            (x, -0.048, 0.50),
            finish="cream",
            bevel=0.002,
        )
        adopt(guard, rig)
        adopt(ring(f"ankle_{side}", (x, 0.008, 0.105), 0.046, 0.006, finish="gold"), rig)
        boot = plate(
            f"boot_{side}",
            (0.088, 0.20, 0.07),
            (x, -0.02, 0.045),
            finish="umber",
            bevel=0.006,
            segments=3,
        )
        adopt(boot, rig)
        toe = plate(
            f"toe_{side}",
            (0.078, 0.07, 0.032),
            (x, -0.105, 0.055),
            finish="cream",
            bevel=0.004,
        )
        adopt(toe, rig)
        welt = plate(
            f"welt_{side}",
            (0.096, 0.214, 0.012),
            (x, -0.02, 0.012),
            finish="gold",
            bevel=0.002,
        )
        adopt(welt, rig)

    # Arms and hands. Palms face the thighs so the visitor sees the back of the hand.
    for side in (-1, 1):
        shoulder = Vector((side * 0.175, -0.012, 1.45))
        elbow = Vector((side * 0.23, -0.03, 1.18))
        wrist = Vector((side * 0.25, -0.05, 0.96))
        adopt(sphere(f"shoulder_{side}", shoulder, 0.046, "gold"), rig)
        cap = sphere(
            f"pauldron_{side}",
            (shoulder.x, shoulder.y - 0.008, shoulder.z + 0.012),
            0.058,
            "cream",
            scale=(1.25, 0.8, 0.62),
        )
        adopt(cap, rig)
        adopt(cylinder_between(f"upper_{side}", shoulder, elbow, 0.036, "olive"), rig)
        adopt(sphere(f"elbow_{side}", elbow, 0.038, "joint"), rig)
        adopt(ring(f"elbow_ring_{side}", elbow, 0.04, 0.006, finish="gold"), rig)
        adopt(cylinder_between(f"fore_{side}", elbow, wrist, 0.03, "cream"), rig)
        adopt(
            plate(
                f"cuff_{side}",
                (0.05, 0.04, 0.028),
                (wrist.x, wrist.y - 0.01, wrist.z + 0.02),
                finish="teal",
                bevel=0.002,
            ),
            rig,
        )
        build_hand(side, wrist, rig)

    # Realize modifiers, then join meshes that share a finish and a rig parent.
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    roles = {obj.name: group_of(obj) for obj in meshes}
    for obj in meshes:
        realize(obj)
    if "suit" in bpy.data.objects:
        outward_check(bpy.data.objects["suit"])
    if "skull" in bpy.data.objects:
        outward_check(bpy.data.objects["skull"])

    groups = {}
    loose = []
    for obj in [obj for obj in bpy.data.objects if obj.type == "MESH"]:
        if obj.name.startswith("lens") or obj.name == "nose":
            loose.append(obj)
            continue
        key = (roles.get(obj.name, "body"), finish_of(obj))
        groups.setdefault(key, []).append(obj)

    for (grp, finish), members in groups.items():
        parent = head if grp == "head" else rig
        for obj in members:
            bake_world(obj)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in members:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        if len(members) > 1:
            bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = f"{grp}_{finish}"
        assign(joined, finish)
        adopt(joined, parent)

    for obj in loose:
        adopt(obj, head)

    # Feet sit on z = 0. Drop the rig if a welt sank slightly below.
    low, high = world_bbox([obj for obj in bpy.data.objects if obj.type == "MESH"])
    if low.z < 0:
        rig.location.z -= low.z
        bpy.context.view_layer.update()
        low, high = world_bbox([obj for obj in bpy.data.objects if obj.type == "MESH"])
    print(f"bbox z {low.z:.3f} .. {high.z:.3f}  x {low.x:.3f} .. {high.x:.3f}  y {low.y:.3f} .. {high.y:.3f}")

    polys = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            polys += len(obj.data.polygons)
    print(f"polygons {polys}")

    bpy.ops.object.select_all(action="DESELECT")

    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    select_tree(attendant)
    bpy.context.view_layer.objects.active = attendant
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
    )
    print(f"wrote {OUT}")


def outward_check(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    acc = 0.0
    for face in bm.faces:
        center = face.calc_center_median()
        acc += center.x * face.normal.x + center.y * face.normal.y
    if acc < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        print(f"flipped normals {obj.name}")
    bm.to_mesh(obj.data)
    bm.free()


if __name__ == "__main__":
    build()
