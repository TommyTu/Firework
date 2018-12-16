#include "settings.h"
#include <QFile>
#include <QSettings>

Settings settings;


/**
  Loads the application settings, or, if no saved settings are available,
  loads default values for the settings. You can change the defaults here.
**/
void Settings::loadSettingsOrDefaults() {
    // Set the default values below
    QSettings s("CS123", "Firework");
    mode = s.value("mode", MODE_WATER).toInt();
}

void Settings::saveSettings() {
    QSettings s("CS123", "Firework");
    s.setValue("mode", mode);
}
