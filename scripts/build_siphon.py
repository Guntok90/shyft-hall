"""A hospitality paint siphon for the hall gangway.

Blender is Z-up. The bottle stands on +Z and the nozzle points along +Y.
The glTF exporter maps that nozzle to local -Z, which is the direction
src/paint.js already shoots from. The empty named "muzzle" sits on the tip.

Run:
  blender --background --python scripts/build_siphon.py
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public", "models", "siphon.glb")

# Belly center sits below the grip. The nozzle leaves the head along +Y.
BELLY = Vector((0.0, 0.0, -0.185))


def srgb_to_linear(channel):
    color = channel / 255.0
    if color <= 0.04045:
        return color / 12.92
    return ((color + 0.055) / 1.055) ** 2.4


def linear_rgb(rgb):
    return tuple(srgb_to_linear(channel) for channel in rgb) + (1.0,)


def set_input(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is None:
            continue
        socket.default_value = value
        return True
    return False


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for datablock in list(block):
            if datablock.users == 0:
                block.remove(datablock)


def make_material(name, rgb, roughness, metallic, transmission=0.0, emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, ("Base Color",), linear_rgb(rgb))
    set_input(bsdf, ("Roughness",), roughness)
    set_input(bsdf, ("Metallic",), metallic)
    set_input(bsdf, ("Transmission Weight", "Transmission"), transmission)
    set_input(bsdf, ("IOR",), 1.45 if transmission else 1.5)
    if transmission:
        set_input(bsdf, ("Thickness",), 0.012)
    if emission:
        set_input(bsdf, ("Emission Color",), linear_rgb(rgb))
        set_input(bsdf, ("Emission Strength",), emission)
    material.diffuse_color = linear_rgb(rgb)
    return material


def link(obj, parent):
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def mesh_from(name, bm, material, parent, sharp=0.9):
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if not edge.is_manifold:
            continue
        if edge.calc_face_angle(0.0) > sharp:
            edge.smooth = False
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    return link(obj, parent)


def lathe(name, profile, material, parent, steps=64):
    bm = bmesh.new()
    verts = [bm.verts.new((radius, 0.0, z)) for radius, z in profile]
    bm.verts.ensure_lookup_table()
    edges = [bm.edges.new((verts[index], verts[index + 1])) for index in range(len(verts) - 1)]
    bmesh.ops.spin(
        bm,
        geom=edges,
        angle=math.tau,
        steps=steps,
        axis=Vector((0.0, 0.0, 1.0)),
        cent=Vector((0.0, 0.0, 0.0)),
        use_merge=True,
    )
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-5)
    return mesh_from(name, bm, material, parent, sharp=1.2)


def tube(name, points, radius, material, parent, sides=10):
    bm = bmesh.new()
    rings = []
    count = len(points)
    for index, point in enumerate(points):
        here = Vector(point)
        if index < count - 1:
            tangent = Vector(points[index + 1]) - here
        else:
            tangent = here - Vector(points[index - 1])
        tangent.normalize()
        helper = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(helper)) > 0.85:
            helper = Vector((1.0, 0.0, 0.0))
        side = tangent.cross(helper).normalized()
        lift = side.cross(tangent).normalized()
        ring = []
        for step in range(sides):
            angle = math.tau * step / sides
            offset = side * math.cos(angle) + lift * math.sin(angle)
            ring.append(bm.verts.new(here + offset * radius))
        rings.append(ring)
    for index in range(count - 1):
        for step in range(sides):
            nxt = (step + 1) % sides
            bm.faces.new((
                rings[index][step],
                rings[index][nxt],
                rings[index + 1][nxt],
                rings[index + 1][step],
            ))
    return mesh_from(name, bm, material, parent)


def icosphere(name, center, radius, material, parent, subdivisions=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=Vector(center))
    return mesh_from(name, bm, material, parent, sharp=2.0)


def cylinder(name, radius, depth, material, parent, location, rotation, vertices=32):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=vertices,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    euler = Vector(rotation)
    bmesh.ops.rotate(
        bm,
        verts=list(bm.verts),
        cent=Vector((0.0, 0.0, 0.0)),
        matrix=__import__("mathutils").Matrix.Rotation(euler.x, 4, "X")
        @ __import__("mathutils").Matrix.Rotation(euler.y, 4, "Y")
        @ __import__("mathutils").Matrix.Rotation(euler.z, 4, "Z"),
    )
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=Vector(location))
    return mesh_from(name, bm, material, parent)


def build():
    clear_scene()
    aluminum = make_material("aluminum", (198, 202, 206), 0.28, 1.0)
    polish = make_material("polish", (214, 216, 218), 0.16, 1.0)
    # Partial metal, so the sun still lights the big foot. Full metal goes flat gray here.
    brushed = make_material("brushed", (216, 220, 224), 0.4, 0.72)
    joint = make_material("joint", (38, 36, 34), 0.42, 0.72)
    umber = make_material("umber", (92, 64, 46), 0.62, 0.0)
    gold = make_material("gold", (196, 154, 78), 0.3, 1.0)
    terracotta = make_material("terracotta", (175, 90, 61), 0.46, 0.08)
    cream = make_material("cream", (236, 214, 190), 0.5, 0.0)
    glass = make_material("glass", (214, 228, 232), 0.04, 0.0, transmission=1.0)
    paints = [
        make_material("paint-red", (255, 43, 74), 0.32, 0.0, emission=0.15),
        make_material("paint-yellow", (255, 210, 58), 0.32, 0.0, emission=0.12),
        make_material("paint-mint", (46, 230, 166), 0.32, 0.0, emission=0.12),
        make_material("paint-blue", (62, 196, 255), 0.32, 0.0, emission=0.12),
        make_material("paint-orange", (255, 106, 26), 0.32, 0.0, emission=0.12),
        make_material("paint-lilac", (179, 136, 255), 0.32, 0.0, emission=0.1),
        make_material("paint-ivory", (246, 241, 232), 0.4, 0.0, emission=0.05),
    ]

    root = bpy.data.objects.new("siphon", None)
    root.empty_display_type = "PLAIN_AXES"
    link(root, None)

    # Open at the bottom. A closed punt reads as a black disc through transmission.
    bottle = [
        (0.062, -0.256),
        (0.065, -0.236),
        (0.067, -0.210),
        (0.067, -0.190),
        (0.063, -0.130),
        (0.050, -0.086),
        (0.036, -0.058),
        (0.030, -0.042),
    ]
    lathe("bottle", bottle, glass, root, steps=72)

    head = [
        (0.026, -0.048),
        (0.040, -0.040),
        (0.042, -0.018),
        (0.038, 0.006),
        (0.034, 0.028),
        (0.028, 0.046),
        (0.016, 0.058),
        (0.0, 0.064),
    ]
    lathe("head", head, aluminum, root, steps=64)

    for index, z in enumerate((-0.034, -0.028, -0.022, -0.016)):
        cylinder(
            f"knurl-{index}",
            0.044,
            0.0032,
            joint if index % 2 else aluminum,
            root,
            (0.0, 0.0, z),
            (0.0, 0.0, 0.0),
            vertices=40,
        )

    cylinder("collar", 0.033, 0.022, umber, root, (0.0, 0.0, -0.055), (0.0, 0.0, 0.0), vertices=40)
    cylinder("band", 0.0345, 0.006, terracotta, root, (0.0, 0.0, -0.066), (0.0, 0.0, 0.0), vertices=40)
    # Rounded cup. The glass rim drops into it, and the cream well is the floor inside the bottle.
    boot = [
        (0.0, -0.360),
        (0.030, -0.356),
        (0.054, -0.346),
        (0.066, -0.328),
        (0.070, -0.290),
        (0.072, -0.262),
        (0.074, -0.254),
    ]
    lathe("boot", boot, brushed, root, steps=64)
    cylinder("boot-line", 0.073, 0.004, joint, root, (0.0, 0.0, -0.300), (0.0, 0.0, 0.0), vertices=48)
    # A ring, not a disc, so the cream floor stays visible through the glass.
    lip = [
        (0.064, -0.258),
        (0.078, -0.254),
        (0.082, -0.248),
        (0.078, -0.242),
        (0.064, -0.236),
    ]
    lathe("boot-lip", lip, polish, root, steps=64)
    cylinder("well", 0.066, 0.006, cream, root, (0.0, 0.0, -0.266), (0.0, 0.0, 0.0), vertices=40)
    for index in range(6):
        angle = math.tau * index / 6.0
        cylinder(
            f"rib-{index}",
            0.0022,
            0.18,
            aluminum,
            root,
            (math.cos(angle) * 0.073, math.sin(angle) * 0.073, -0.162),
            (0.0, 0.0, 0.0),
            vertices=8,
        )

    nozzle = [
        (0.016, 0.0),
        (0.018, 0.012),
        (0.015, 0.055),
        (0.012, 0.058),
        (0.010, 0.100),
        (0.013, 0.108),
        (0.013, 0.128),
        (0.007, 0.136),
        (0.005, 0.150),
    ]
    nozzle_obj = lathe("nozzle", nozzle, polish, root, steps=40)
    # Local +Z of the lathe becomes world +Y. glTF then maps +Y to -Z.
    nozzle_obj.rotation_euler = (-math.pi / 2, 0.0, 0.0)
    nozzle_obj.location = (0.0, 0.03, 0.012)
    cylinder(
        "valve",
        0.024,
        0.046,
        aluminum,
        root,
        (0.0, 0.052, 0.012),
        (-math.pi / 2, 0.0, 0.0),
        vertices=28,
    )

    cylinder(
        "crown",
        0.015,
        0.006,
        gold,
        root,
        (0.0, 0.158, 0.012),
        (-math.pi / 2, 0.0, 0.0),
        vertices=28,
    )

    lever = [
        (0.0, -0.012, 0.052),
        (0.0, -0.028, 0.078),
        (0.0, -0.058, 0.096),
        (0.0, -0.078, 0.086),
        (0.0, -0.070, 0.070),
    ]
    tube("lever", lever, 0.0065, aluminum, root, sides=12)
    cylinder(
        "paddle",
        0.014,
        0.006,
        umber,
        root,
        (0.0, -0.074, 0.078),
        (0.0, math.pi / 2, 0.0),
        vertices=20,
    )
    cylinder(
        "pivot",
        0.007,
        0.052,
        gold,
        root,
        (0.0, -0.012, 0.052),
        (0.0, math.pi / 2, 0.0),
        vertices=16,
    )
    for side in (-1, 1):
        cylinder(
            f"yoke-{side}",
            0.010,
            0.006,
            joint,
            root,
            (side * 0.018, -0.012, 0.052),
            (0.0, math.pi / 2, 0.0),
            vertices=16,
        )

    cylinder(
        "gauge",
        0.016,
        0.008,
        polish,
        root,
        (0.040, 0.0, 0.006),
        (0.0, math.pi / 2, 0.0),
        vertices=28,
    )
    cylinder(
        "dial",
        0.012,
        0.003,
        cream,
        root,
        (0.045, 0.0, 0.006),
        (0.0, math.pi / 2, 0.0),
        vertices=24,
    )
    cylinder(
        "needle",
        0.0016,
        0.016,
        joint,
        root,
        (0.0475, 0.003, 0.010),
        (0.5, 0.0, 0.0),
        vertices=8,
    )

    for index in range(6):
        angle = math.tau * index / 6
        cylinder(
            f"screw-{index}",
            0.0032,
            0.004,
            joint,
            root,
            (math.cos(angle) * 0.032, math.sin(angle) * 0.032, -0.006),
            (0.0, 0.0, 0.0),
            vertices=10,
        )

    for index, material in enumerate(paints):
        tilt = math.tau * index * 0.618
        height = 1.0 - (index / 6.0) * 2.0
        ring = math.sqrt(max(0.0, 1.0 - height * height))
        center = BELLY + Vector((
            math.cos(tilt) * ring * 0.032,
            math.sin(tilt) * ring * 0.032,
            height * 0.055,
        ))
        icosphere(f"ball-{index}", center, 0.013 + (index % 3) * 0.0015, material, root)

    muzzle = bpy.data.objects.new("muzzle", None)
    muzzle.empty_display_type = "PLAIN_AXES"
    muzzle.empty_display_size = 0.02
    # Nozzle lathe runs to local z 0.15, then pitches onto +Y from y 0.03.
    # The tip is just past y 0.18. The empty sits a little beyond it.
    muzzle.location = (0.0, 0.192, 0.012)
    link(muzzle, root)

    bpy.context.view_layer.update()
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    polys = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        polys += len(obj.data.polygons)
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            low.x, low.y, low.z = min(low.x, world.x), min(low.y, world.y), min(low.z, world.z)
            high.x, high.y, high.z = max(high.x, world.x), max(high.y, world.y), max(high.z, world.z)
    print(
        f"bbox x {low.x:.3f}..{high.x:.3f}  y {low.y:.3f}..{high.y:.3f}  z {low.z:.3f}..{high.z:.3f}"
    )
    print(f"polygons {polys}")

    bpy.ops.object.select_all(action="DESELECT")

    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    select_tree(root)
    bpy.context.view_layer.objects.active = root
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
    )
    print(f"wrote {OUT}")
    blend_path = os.path.join(ROOT, "siphon.blend")
    try:
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)
        print(f"wrote {blend_path}")
    except RuntimeError as exc:
        print("blend save", exc)


if __name__ == "__main__":
    build()
