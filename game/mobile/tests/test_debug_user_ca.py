"""Check opt-in debug CA policy generation without changing the Android project."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

TOOLS = Path(__file__).resolve().parents[1] / 'tools'
sys.path.insert(0, str(TOOLS))
spec = importlib.util.spec_from_file_location('debug_user_ca', TOOLS / 'debug_user_ca.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DebugUserCATest(unittest.TestCase):
    def test_opt_in_preserves_loopback_policy_and_is_reversible(self):
        with tempfile.TemporaryDirectory(prefix='oki-debug-ca-') as folder:
            root = Path(folder)
            main = root / 'main/res/xml/oki_loopback_network.xml'
            debug = root / 'debug/res/xml/oki_loopback_network.xml'
            main.parent.mkdir(parents=True)
            main.write_text(module.LOOPBACK_NETWORK_CONFIG, encoding='utf-8')
            module.enable(main, debug)
            before = debug.read_bytes()
            module.enable(main, debug)
            self.assertEqual(before, debug.read_bytes())
            xml = ET.parse(debug).getroot()
            self.assertEqual(xml.find('base-config').get('cleartextTrafficPermitted'), 'false')
            self.assertEqual({node.text for node in xml.findall('domain-config/domain')}, {'localhost', '127.0.0.1', '[::1]', '::1'})
            self.assertEqual(xml.find('debug-overrides/trust-anchors/certificates').get('src'), 'user')
            self.assertEqual(main.read_text(encoding='utf-8'), module.LOOPBACK_NETWORK_CONFIG)
            self.assertTrue(module.disable(debug))
            self.assertFalse(module.disable(debug))
            self.assertFalse(debug.exists())

    def test_never_replaces_or_deletes_custom_policies(self):
        with tempfile.TemporaryDirectory(prefix='oki-debug-ca-') as folder:
            root = Path(folder)
            main = root / 'main.xml'
            debug = root / 'debug.xml'
            main.write_text('<custom/>', encoding='utf-8')
            with self.assertRaises(ValueError):
                module.enable(main, debug)
            self.assertFalse(debug.exists())
            main.write_text(module.LOOPBACK_NETWORK_CONFIG, encoding='utf-8')
            debug.write_text('<custom/>', encoding='utf-8')
            with self.assertRaises(ValueError):
                module.enable(main, debug)
            with self.assertRaises(ValueError):
                module.disable(debug)
            self.assertEqual(debug.read_text(encoding='utf-8'), '<custom/>')


if __name__ == '__main__':
    unittest.main()
