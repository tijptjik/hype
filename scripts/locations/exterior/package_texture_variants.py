"""Package aligned government and photo GLBs plus generated material images for the viewer.

Usage: python package_texture_variants.py government.glb revised.glb generated.json out.glb
The JSON maps each corrected material name to a JPEG or PNG on its revised UV layout.
Both GLBs must contain aligned, non-indexed triangles with tightly packed accessors.
"""

import argparse
import copy
import json
from pathlib import Path
import struct


def read_glb(path):
    data = path.read_bytes()
    magic, version, length, json_size, chunk = struct.unpack_from("<4sIII4s", data)
    assert (magic, version, length, chunk) == (b"glTF", 2, len(data), b"JSON")
    doc = json.loads(data[20 : 20 + json_size])
    binary_size, chunk = struct.unpack_from("<I4s", data, 20 + json_size)
    binary = data[28 + json_size :]
    assert chunk == b"BIN\0" and len(binary) == binary_size
    return doc, binary


def package(government, revised, generated, destination):
    doc, original = read_glb(government)
    photo, edited = read_glb(revised)
    assert doc["nodes"] == photo["nodes"] and doc["scenes"] == photo["scenes"]
    assert "extensionsUsed" not in doc and "extensionsUsed" not in photo
    images = json.loads(generated.read_text())
    binary = bytearray(original)
    used = set()
    layers = []
    cache = {}

    def append_view(data):
        binary.extend(bytes(-len(binary) % 4))
        view = dict(buffer=0, byteOffset=len(binary), byteLength=len(data))
        binary.extend(data)
        doc["bufferViews"].append(view)
        return len(doc["bufferViews"]) - 1

    def read_view(document, blob, idx):
        view = document["bufferViews"][idx]
        start = view.get("byteOffset", 0)
        return blob[start : start + view["byteLength"]]

    def accessor(document, blob, idx):
        a = document["accessors"][idx]
        assert (
            not a.get("byteOffset")
            and "byteStride" not in document["bufferViews"][a["bufferView"]]
        )
        return {k: v for k, v in a.items() if k != "bufferView"}, read_view(
            document, blob, a["bufferView"]
        )

    def add_material(name, pixels, mime, template):
        if name in cache:
            return cache[name]
        mat = copy.deepcopy(template)
        mat["name"] = name
        idx = len(doc["materials"])
        doc["materials"].append(mat)
        mat["pbrMetallicRoughness"]["baseColorTexture"] = dict(
            index=len(doc["textures"]), texCoord=1
        )
        doc["textures"].append(dict(source=len(doc["images"])))
        doc["images"].append(dict(bufferView=append_view(pixels), mimeType=mime))
        cache[name] = idx
        return idx

    for gm, pm in zip(doc["meshes"], photo["meshes"], strict=True):
        for gp, pp in zip(gm["primitives"], pm["primitives"], strict=True):
            assert gp.get("mode", 4) == pp.get("mode", 4) == 4
            assert "indices" not in gp and "indices" not in pp
            for key in ["POSITION", "NORMAL"]:
                assert accessor(doc, original, gp["attributes"][key]) == accessor(
                    photo, edited, pp["attributes"][key]
                )
            material = photo["materials"][pp["material"]]
            name = material["name"]
            if name not in images:
                assert name == doc["materials"][gp["material"]]["name"], (
                    f"Missing variant for {name}"
                )
                continue
            used.add(name)
            uv, data = accessor(photo, edited, pp["attributes"]["TEXCOORD_0"])
            gp["attributes"]["TEXCOORD_1"] = len(doc["accessors"])
            doc["accessors"].append({**uv, "bufferView": append_view(data)})
            # A distinct base material keeps the roof and other source surfaces out of the blend.
            base = len(doc["materials"])
            doc["materials"].append(copy.deepcopy(doc["materials"][gp["material"]]))
            gp["material"] = base
            texture = photo["textures"][
                material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
            ]
            image = photo["images"][texture["source"]]
            revised_id = add_material(
                name,
                read_view(photo, edited, image["bufferView"]),
                image["mimeType"],
                material,
            )
            generated_file = generated.parent / images[name]
            pixels = generated_file.read_bytes()
            if pixels.startswith(b"\xff\xd8\xff"):
                mime = "image/jpeg"
            elif pixels.startswith(b"\x89PNG\r\n\x1a\n"):
                mime = "image/png"
            else:
                raise ValueError(f"Expected a JPEG or PNG at {generated_file}")
            generated_id = add_material(
                name + "-generated", pixels, mime, material
            )
            gp["extensions"] = {
                "KHR_materials_variants": {
                    "mappings": [
                        {"material": revised_id, "variants": [0]},
                        {"material": generated_id, "variants": [1]},
                    ]
                }
            }
            layers.append(
                {"government": base, "revised": revised_id, "generated": generated_id}
            )
    assert layers and used == set(images)
    doc["extensionsUsed"] = ["KHR_materials_variants"]
    doc["extensions"] = {
        "KHR_materials_variants": {
            "variants": [{"name": "Revised"}, {"name": "AI-generated"}]
        }
    }
    doc.setdefault("extras", {})["exteriorTextureLayers"] = layers
    doc["buffers"] = [{"byteLength": len(binary)}]
    binary.extend(bytes(-len(binary) % 4))
    header = json.dumps(doc, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    destination.write_bytes(
        struct.pack(
            "<4sIII4s", b"glTF", 2, 28 + len(header) + len(binary), len(header), b"JSON"
        )
        + header
        + struct.pack("<I4s", len(binary), b"BIN\0")
        + binary
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ["government", "revised", "generated", "destination"]:
        parser.add_argument(key, type=Path)
    package(**vars(parser.parse_args()))
