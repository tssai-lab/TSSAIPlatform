# COCO128 source and adaptation notice

- Official archive: https://github.com/ultralytics/assets/releases/download/v0.0.0/coco128.zip
- Archive SHA-256: `61e5e3028863d8ffc3b81d6a514603954889f0edd5e4b44c4ce60b2da99aeb8e`
- Contents: first 128 images from COCO train2017 with YOLO-format labels.
- Adaptation: images are deterministically split into 96 train, 16 validation, and 16 test images. Two source background images receive empty YOLO label files; two source orphan label files without matching images are omitted. Image pixels and non-empty annotations are otherwise unchanged.
- Attribution: COCO Consortium and Ultralytics. Cite the COCO paper identified in the package README.
- Licensing: the upstream archive's LICENSE and README are included beside this file. COCO source images can retain source-specific terms; users must preserve attribution and the supplied notices.
