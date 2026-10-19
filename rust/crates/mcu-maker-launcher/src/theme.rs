use egui::{Color32, Margin, Rounding, Stroke, Visuals};

pub const COLOR_BG: Color32 = Color32::from_rgb(11, 15, 25);
pub const COLOR_CARD_BG: Color32 = Color32::from_rgb(16, 23, 40);
pub const COLOR_CARD_BORDER: Color32 = Color32::from_rgb(30, 41, 59);
#[allow(dead_code)]
pub const COLOR_CARD_BORDER_HOVER: Color32 = Color32::from_rgb(51, 65, 85);

pub const COLOR_CYAN: Color32 = Color32::from_rgb(6, 182, 212);
pub const COLOR_CYAN_LIGHT: Color32 = Color32::from_rgb(34, 211, 238);
pub const COLOR_TEXT_PRIMARY: Color32 = Color32::from_rgb(248, 250, 252);
pub const COLOR_TEXT_MUTED: Color32 = Color32::from_rgb(148, 163, 184);
pub const COLOR_TEXT_DIM: Color32 = Color32::from_rgb(100, 116, 139);

pub const COLOR_GREEN: Color32 = Color32::from_rgb(16, 185, 129);
pub const COLOR_RED: Color32 = Color32::from_rgb(239, 68, 68);
pub const COLOR_AMBER: Color32 = Color32::from_rgb(245, 158, 11);
pub const COLOR_BLUE: Color32 = Color32::from_rgb(59, 130, 246);

// Vector Icons (Font Awesome 6 Free Solid & Brands)
#[allow(dead_code)]
pub const ICON_BOLT: &str = "\u{f0e7}";         // fa-bolt
#[allow(dead_code)]
pub const ICON_ROCKET: &str = "\u{f135}";       // fa-rocket
#[allow(dead_code)]
pub const ICON_RUST: &str = "\u{e07a}";         // fa-rust (brands)
#[allow(dead_code)]
pub const ICON_CHIP: &str = "\u{f2db}";         // fa-microchip
#[allow(dead_code)]
pub const ICON_USB: &str = "\u{f287}";          // fa-usb (brands)
#[allow(dead_code)]
pub const ICON_GLOBE: &str = "\u{f0ac}";        // fa-globe
#[allow(dead_code)]
pub const ICON_PLAY: &str = "\u{f04b}";         // fa-play
#[allow(dead_code)]
pub const ICON_STOP: &str = "\u{f04d}";         // fa-stop
#[allow(dead_code)]
pub const ICON_RESTART: &str = "\u{f021}";      // fa-arrows-rotate / sync
#[allow(dead_code)]
pub const ICON_MOBILE: &str = "\u{f3cd}";       // fa-mobile-screen-button
#[allow(dead_code)]
pub const ICON_COPY: &str = "\u{f0c5}";         // fa-copy
#[allow(dead_code)]
pub const ICON_SEARCH: &str = "\u{f002}";       // fa-magnifying-glass
#[allow(dead_code)]
pub const ICON_TRASH: &str = "\u{f1f8}";        // fa-trash-can
#[allow(dead_code)]
pub const ICON_SAVE: &str = "\u{f0c7}";         // fa-floppy-disk
#[allow(dead_code)]
pub const ICON_GEAR: &str = "\u{f013}";         // fa-gear
#[allow(dead_code)]
pub const ICON_WIFI: &str = "\u{f1eb}";         // fa-wifi
#[allow(dead_code)]
pub const ICON_BOXES: &str = "\u{f1b3}";        // fa-cubes
#[allow(dead_code)]
pub const ICON_TERMINAL: &str = "\u{f120}";     // fa-terminal
#[allow(dead_code)]
pub const ICON_BOOK: &str = "\u{f02d}";         // fa-book
#[allow(dead_code)]
pub const ICON_CODE: &str = "\u{f121}";         // fa-code
#[allow(dead_code)]
pub const ICON_LIGHTBULB: &str = "\u{f0eb}";    // fa-lightbulb
#[allow(dead_code)]
pub const ICON_CHECK: &str = "\u{f00c}";        // fa-check
#[allow(dead_code)]
pub const ICON_POWER: &str = "\u{f011}";        // fa-power-off
#[allow(dead_code)]
pub const ICON_EXTERNAL: &str = "\u{f08e}";     // fa-arrow-up-right-from-square

pub fn apply_theme(ctx: &egui::Context) {
    let mut visuals = Visuals::dark();

    visuals.panel_fill = COLOR_BG;
    visuals.window_fill = COLOR_BG;
    visuals.window_stroke = Stroke::new(1.0_f32, COLOR_CARD_BORDER);
    visuals.window_rounding = Rounding::same(12.0_f32);

    // Widget styling - modern rounded buttons with balanced states
    visuals.widgets.noninteractive.bg_fill = COLOR_CARD_BG;
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0_f32, COLOR_CARD_BORDER);
    visuals.widgets.noninteractive.rounding = Rounding::same(8.0_f32);
    visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0_f32, COLOR_TEXT_PRIMARY);

    visuals.widgets.inactive.bg_fill = Color32::from_rgb(22, 31, 50);
    visuals.widgets.inactive.bg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(38, 52, 78));
    visuals.widgets.inactive.rounding = Rounding::same(7.0_f32);
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0_f32, COLOR_TEXT_PRIMARY);

    visuals.widgets.hovered.bg_fill = Color32::from_rgb(32, 45, 72);
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0_f32, COLOR_CYAN);
    visuals.widgets.hovered.rounding = Rounding::same(7.0_f32);
    visuals.widgets.hovered.fg_stroke = Stroke::new(1.0_f32, Color32::WHITE);

    visuals.widgets.active.bg_fill = COLOR_CYAN;
    visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, COLOR_CYAN_LIGHT);
    visuals.widgets.active.rounding = Rounding::same(7.0_f32);
    visuals.widgets.active.fg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(11, 15, 25));

    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    style.text_styles = [
        (egui::TextStyle::Heading, egui::FontId::new(17.5, egui::FontFamily::Proportional)),
        (egui::TextStyle::Name("Subheading".into()), egui::FontId::new(14.5, egui::FontFamily::Proportional)),
        (egui::TextStyle::Body, egui::FontId::new(12.5, egui::FontFamily::Proportional)),
        (egui::TextStyle::Button, egui::FontId::new(12.0, egui::FontFamily::Proportional)),
        (egui::TextStyle::Small, egui::FontId::new(10.5, egui::FontFamily::Proportional)),
        (egui::TextStyle::Monospace, egui::FontId::new(11.5, egui::FontFamily::Monospace)),
    ].into();
    style.spacing.item_spacing = egui::vec2(8.0, 6.0);
    style.spacing.button_padding = egui::vec2(13.0, 6.5);
    ctx.set_style(style);
}

pub fn card_frame() -> egui::Frame {
    egui::Frame {
        inner_margin: Margin::symmetric(18.0_f32, 15.0_f32),
        rounding: Rounding::same(12.0_f32),
        fill: Color32::from_rgb(15, 23, 42),
        stroke: Stroke::new(1.0_f32, Color32::from_rgb(30, 41, 59)),
        ..Default::default()
    }
}

/// Renders a clean, frameless vector icon in its vibrant accent color without any box or border
pub fn render_icon_badge(ui: &mut egui::Ui, icon: &str, accent_color: Color32) {
    let size = egui::vec2(34.0, 34.0);
    let (raw_rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());

    let rect = egui::Rect::from_min_size(
        egui::pos2(raw_rect.min.x.round(), raw_rect.min.y.round()),
        size,
    );

    let center = egui::pos2(rect.center().x.round(), rect.center().y.round());

    // Pure frameless vector icon rendered directly with crisp vector clarity
    ui.painter().text(
        center,
        egui::Align2::CENTER_CENTER,
        icon,
        egui::FontId::new(26.0, egui::FontFamily::Name("icons".into())),
        accent_color,
    );
}

/// Renders a sleek pill badge with padding, rounded corners and matching tint
pub fn render_pill(ui: &mut egui::Ui, text: &str, text_color: Color32, bg_color: Color32, border_color: Option<Color32>) {
    let padding = egui::vec2(9.0, 3.0);
    let font_id = egui::FontId::proportional(10.5);
    let galley = ui.painter().layout_no_wrap(text.to_string(), font_id, text_color);
    let size = galley.size() + padding * 2.0;
    let (raw_rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());

    let rect = egui::Rect::from_min_size(
        egui::pos2(raw_rect.min.x.round(), raw_rect.min.y.round()),
        egui::vec2(size.x.round(), size.y.round()),
    );

    let stroke = border_color.map(|c| Stroke::new(1.0_f32, c)).unwrap_or(Stroke::NONE);

    ui.painter().rect(
        rect,
        Rounding::same(rect.height() / 2.0),
        bg_color,
        stroke,
    );
    ui.painter().galley(
        egui::pos2((rect.min.x + padding.x).round(), (rect.min.y + padding.y).round()),
        galley,
        text_color,
    );
}

/// Renders a subtle code chip (e.g. for endpoints or ports) with copyable appearance
pub fn render_chip(ui: &mut egui::Ui, text: &str, text_color: Color32) {
    let padding = egui::vec2(9.0, 4.0);
    let font_id = egui::FontId::monospace(11.0);
    let galley = ui.painter().layout_no_wrap(text.to_string(), font_id, text_color);
    let size = galley.size() + padding * 2.0;
    let (raw_rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());

    let rect = egui::Rect::from_min_size(
        egui::pos2(raw_rect.min.x.round(), raw_rect.min.y.round()),
        egui::vec2(size.x.round(), size.y.round()),
    );

    ui.painter().rect(
        rect,
        Rounding::same(6.0),
        Color32::from_rgb(10, 14, 24),
        Stroke::new(1.0_f32, Color32::from_rgb(30, 41, 59)),
    );
    ui.painter().galley(
        egui::pos2((rect.min.x + padding.x).round(), (rect.min.y + padding.y).round()),
        galley,
        text_color,
    );
}
