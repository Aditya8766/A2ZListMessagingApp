# A2Z Internal Messaging for Android

The app opens to one SMS screen. **Read messages** loads the phone's SMS store locally, 50 messages at a time. **Compose** previews the message and includes the optional title on the first line. **Review and send SMS** asks for confirmation and sends the same text separately to each entered number using the default SMS SIM. Enter up to 20 numbers separated by commas or new lines. Every recipient receives an A2Z transaction ID in the in-app report. The green **SMS sent successfully** banner appears after Android reports that all parts were sent. Use **Share report** to share the per-recipient transaction IDs and statuses. Check the recipient's phone to confirm delivery. The screen uses SMS. MMS and RCS conversations are outside its scope.

## Build the standalone test APK

1. In Android Studio, open **Tools > SDK Manager**. Install **Android SDK Platform 37.0**, **Android SDK Build-Tools 37.0.0**, and **Android SDK Platform-Tools**. Under **Show Package Details**, select **NDK (Side by side) 27.1.12297006** and **CMake 3.22.1** if Gradle asks for them. Copy the **Android SDK Location** from the top of SDK Manager.
2. Run the following in PowerShell. Replace the SDK path if Android Studio shows a different one.

```powershell
Set-Location C:\Projects\A2ZInternalMessagingApp\mobile
npm.cmd ci
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx.cmd expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat :app:assembleRelease
```

The generated test APK is at `mobile/android/app/build/outputs/apk/release/app-release.apk`. The local Gradle release configuration uses the debug signing key for internal testing. This build bundles JavaScript and runs independently of Metro, Expo Go, and the backend.

## Install and test on a physical phone

1. On the phone, open **Settings > About phone** and tap **Build number** seven times. Enable **USB debugging** under **Developer options**.
2. Connect the unlocked phone with a USB data cable and approve the **Allow USB debugging** prompt. From the `mobile/android` directory, run:

```powershell
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
& $adb devices
& $adb install -r '.\app\build\outputs\apk\release\app-release.apk'
```

   The device should appear as `device` and installation should report `Success`. If installation reports incompatible signatures, use an APK signed with the same key as the installed copy, or uninstall the old app after saving any app data you need.

3. Launch **A2Z Internal Messaging**, open **Device SMS**, tap **Read messages**, and tap **Allow** if Android asks. Compare an ordinary SMS with the same text in the phone's Messages app. Use **Refresh messages** after receiving a fresh text and **Load older messages** to test pagination.
4. Choose an active default SMS SIM in Android Settings, especially on dual-SIM devices. On **Compose**, enter one test number in **To** and write a message. Tap **Review and send SMS**, confirm **Send**, and tap **Allow** if asked. Wait for the send result, then check the text on the recipient's phone. For multiple recipients, separate numbers with commas.
5. To recheck permissions, open **Settings > Apps > A2Z Internal Messaging > Permissions > SMS**. Android can group read and send under one SMS permission. Android restricts SMS access at installation, so use the USB install above if a file-manager install leaves the permission unavailable. If a work-managed phone still blocks SMS, the device administrator controls that policy.

For your manager, share the same APK and use the USB install steps on her phone if needed. Once installed with SMS access, she can complete all the phone tests inside the app.

## Refresh changes during development

A standalone APK contains a snapshot of the code. To see UI changes on the phone as you save, build and install an Expo development build with `npx.cmd expo run:android --device` from `mobile`. With that development build installed, use `npx.cmd expo start --dev-client` for later editing sessions. Rebuild for Kotlin or Android permission changes.

## Backend campaign status

The existing gateway's `POST /api/sms/send` queues a message for one number. The APK screen works with manually entered numbers and does not consume that queue. The workspace contains no other-app user directory or marketing opt-in data. Campaign delivery to that audience requires the other app's authenticated recipient source, including opted-in phone numbers.
"# A2ZListMessagingApp" 
