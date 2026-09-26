fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_boot_status",
                "check_for_update_now",
                "install_update_now",
                "save_text_file",
                "open_text_file",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
