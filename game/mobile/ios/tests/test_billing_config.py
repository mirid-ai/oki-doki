"""Structural checks only; this does not compile Swift or exercise StoreKit."""
from pathlib import Path
import plistlib
import unittest
import xml.etree.ElementTree as ET

IOS = Path(__file__).resolve().parents[1]
APP = IOS / 'App' / 'App'

class BillingConfigurationTest(unittest.TestCase):
    def test_disabled_by_default_and_existing_permissions_retained(self):
        plist = plistlib.loads((APP / 'Info.plist').read_bytes())
        self.assertEqual(plist['RepairKitProductID'], '')
        self.assertIs(plist['RepairKitMinimumTierConfirmed'], False)
        self.assertTrue(plist['NSMicrophoneUsageDescription'])
        self.assertTrue(plist['NSLocalNetworkUsageDescription'])

    def test_both_startup_routes_register_the_plugin(self):
        controller = next(ET.parse(APP / 'Base.lproj' / 'Main.storyboard').getroot().iter('viewController'))
        self.assertEqual(controller.attrib['customClass'], 'GameBridgeViewController')
        self.assertIn('GameBridgeViewController()', (APP / 'SceneDelegate.swift').read_text())
        project = (IOS / 'App' / 'App.xcodeproj' / 'project.pbxproj').read_text()
        self.assertEqual(project.count('D9A100000000000000000001'), 2)
        self.assertEqual(project.count('D9A100000000000000000002'), 3)
        code = (APP / 'RepairKitBillingPlugin.swift').read_text()
        self.assertIn('registerPluginInstance(RepairKitBillingPlugin())', code)
        for method in ('getProduct', 'purchase', 'getEntitlement', 'restore'):
            self.assertIn(f'CAPPluginMethod(name: "{method}"', code)

if __name__ == '__main__':
    unittest.main()
