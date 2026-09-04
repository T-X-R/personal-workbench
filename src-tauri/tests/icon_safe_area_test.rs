use std::{fs::File, io::BufReader, path::Path};

#[test]
fn app_icon_keeps_the_macos_safe_area() {
  let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/icon.png");
  let decoder = png::Decoder::new(BufReader::new(
    File::open(path).expect("app icon should exist"),
  ));
  let mut reader = decoder.read_info().expect("app icon should be a valid PNG");
  let mut buffer = vec![0; reader.output_buffer_size()];
  let info = reader
    .next_frame(&mut buffer)
    .expect("app icon pixels should be readable");

  assert_eq!(info.color_type, png::ColorType::Rgba);
  let mut bounds = (info.width, info.height, 0, 0);
  for (index, pixel) in buffer[..info.buffer_size()].chunks_exact(4).enumerate() {
    if pixel[3] < 64 {
      continue;
    }
    let x = index as u32 % info.width;
    let y = index as u32 / info.width;
    bounds.0 = bounds.0.min(x);
    bounds.1 = bounds.1.min(y);
    bounds.2 = bounds.2.max(x + 1);
    bounds.3 = bounds.3.max(y + 1);
  }

  let content_size = (bounds.2 - bounds.0).max(bounds.3 - bounds.1);
  let occupancy = content_size as f32 / info.width.max(info.height) as f32;
  assert!(
    (0.79..=0.82).contains(&occupancy),
    "visible icon content should occupy 79%-82% of the canvas, got {:.1}%",
    occupancy * 100.0,
  );
}
