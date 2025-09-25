#!/usr/bin/env python3
"""
GalaScan Selenium Scraper
Uses Selenium WebDriver to scrape JavaScript-rendered content
"""

import json
import sys
import time
from datetime import datetime, timedelta
import re

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print("Please install selenium: pip3 install selenium")
    sys.exit(1)

class GalaScanSeleniumScraper:
    def __init__(self, wallet_address, start_date):
        self.wallet_address = wallet_address
        self.start_date = datetime.strptime(start_date, "%Y-%m-%d")
        self.transactions = []
        
    def setup_driver(self):
        """Setup Chrome driver with options"""
        options = Options()
        options.add_argument('--headless')  # Run in background
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
        
        try:
            # Try Chrome
            self.driver = webdriver.Chrome(options=options)
        except:
            try:
                # Try Safari as fallback
                self.driver = webdriver.Safari()
            except:
                print("❌ No suitable browser driver found. Please install ChromeDriver or use Safari.")
                sys.exit(1)
                
        print("✅ Browser driver initialized")
        
    def scrape_wallet_page(self):
        """Scrape the wallet page"""
        # URL encode the pipe character
        encoded_address = self.wallet_address.replace('|', '%7C')
        url = f"https://galascan.gala.com/wallet/{encoded_address}"
        
        print(f"📄 Loading page: {url}")
        self.driver.get(url)
        
        # Wait for page to load
        print("⏳ Waiting for content to load...")
        time.sleep(5)  # Initial wait
        
        try:
            # Wait for wallet info or transaction elements
            WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.TAG_NAME, "main"))
            )
        except TimeoutException:
            print("⚠️ Page load timeout")
            
        # Scroll to load more content
        print("📜 Scrolling to load transactions...")
        last_height = self.driver.execute_script("return document.body.scrollHeight")
        
        for i in range(3):  # Scroll 3 times
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            new_height = self.driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height
            
        # Extract data
        self.extract_wallet_data()
        self.extract_transactions()
        
    def extract_wallet_data(self):
        """Extract wallet balance data"""
        print("\n💰 Extracting wallet data...")
        
        try:
            # Look for balance elements
            balance_selectors = [
                "div[class*='balance']",
                "div[class*='token']",
                "div[class*='asset']",
                "span[class*='amount']"
            ]
            
            balances = {}
            for selector in balance_selectors:
                elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elements:
                    text = elem.text
                    # Look for token amounts
                    match = re.search(r'([\d,]+\.?\d*)\s*(GALA|GUSDC|GWETH|GUSDT)', text, re.IGNORECASE)
                    if match:
                        amount = float(match.group(1).replace(',', ''))
                        token = match.group(2).upper()
                        balances[token] = amount
                        print(f"  Found: {token} = {amount}")
                        
            if balances:
                self.balances = balances
            else:
                print("  No balance data found")
                
        except Exception as e:
            print(f"  Error extracting balances: {e}")
            
    def extract_transactions(self):
        """Extract transaction data"""
        print("\n📜 Extracting transactions...")
        
        # Try different selectors for transaction rows
        transaction_selectors = [
            "tr[class*='transaction']",
            "div[class*='transaction-row']",
            "div[class*='tx-row']",
            "tbody tr",
            "div[role='row']"
        ]
        
        all_transactions = []
        
        for selector in transaction_selectors:
            elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
            if elements:
                print(f"  Found {len(elements)} elements with selector: {selector}")
                
                for elem in elements[:20]:  # Limit to first 20
                    tx = self.parse_transaction_element(elem)
                    if tx:
                        all_transactions.append(tx)
                        
        # Also try to find transaction links
        links = self.driver.find_elements(By.PARTIAL_LINK_TEXT, "0x")
        print(f"  Found {len(links)} transaction links")
        
        for link in links[:10]:
            href = link.get_attribute('href')
            text = link.text
            if 'transaction' in href:
                all_transactions.append({
                    'hash': text,
                    'link': href,
                    'type': 'link'
                })
                
        self.transactions = all_transactions
        print(f"  Total transactions extracted: {len(self.transactions)}")
        
    def parse_transaction_element(self, element):
        """Parse a single transaction element"""
        try:
            text = element.text
            if not text:
                return None
                
            tx = {}
            
            # Look for transaction hash
            hash_match = re.search(r'0x[a-fA-F0-9]{64}', text)
            if hash_match:
                tx['hash'] = hash_match.group()
                
            # Look for date
            date_patterns = [
                r'\d{4}-\d{2}-\d{2}',
                r'\d{1,2}/\d{1,2}/\d{4}',
                r'(\d+)\s*(minute|hour|day)s?\s*ago'
            ]
            
            for pattern in date_patterns:
                date_match = re.search(pattern, text, re.IGNORECASE)
                if date_match:
                    tx['date'] = date_match.group()
                    break
                    
            # Look for swap/trade keywords
            if re.search(r'swap|trade|exchange', text, re.IGNORECASE):
                tx['type'] = 'swap'
                
            # Look for token amounts
            token_matches = re.findall(r'([\d,]+\.?\d*)\s*(GALA|GUSDC|GWETH|GUSDT)', text, re.IGNORECASE)
            if token_matches:
                tx['tokens'] = []
                for amount, token in token_matches:
                    tx['tokens'].append({
                        'amount': float(amount.replace(',', '')),
                        'symbol': token.upper()
                    })
                    
            # Only return if we found meaningful data
            if tx and (tx.get('hash') or tx.get('tokens')):
                return tx
                
        except Exception as e:
            pass
            
        return None
        
    def save_results(self):
        """Save scraped data to file"""
        output = {
            'wallet': self.wallet_address,
            'scraped_at': datetime.now().isoformat(),
            'start_date': self.start_date.isoformat(),
            'transactions': self.transactions,
            'balances': getattr(self, 'balances', {}),
            'page_source_length': len(self.driver.page_source)
        }
        
        filename = f"selenium-scrape-{self.wallet_address[:10]}-{int(time.time())}.json"
        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)
            
        print(f"\n💾 Results saved to: {filename}")
        
        # Also save HTML for debugging
        html_filename = f"selenium-debug-{int(time.time())}.html"
        with open(html_filename, 'w') as f:
            f.write(self.driver.page_source)
        print(f"📄 HTML saved to: {html_filename}")
        
    def calculate_stats(self):
        """Calculate trading statistics"""
        print("\n📊 STATISTICS")
        print("=" * 50)
        
        if hasattr(self, 'balances'):
            print("Current Balances:")
            for token, amount in self.balances.items():
                print(f"  {token}: {amount}")
                
        if self.transactions:
            print(f"\nTransactions Found: {len(self.transactions)}")
            
            # Count swap transactions
            swaps = [tx for tx in self.transactions if tx.get('type') == 'swap' or tx.get('tokens')]
            print(f"Swap Transactions: {len(swaps)}")
            
            # Show sample transactions
            if swaps:
                print("\nSample Transactions:")
                for tx in swaps[:3]:
                    print(f"  - {json.dumps(tx, indent=4)}")
        else:
            print("No transactions found")
            
        print("=" * 50)
        
    def run(self):
        """Main execution"""
        print("🚀 GalaScan Selenium Scraper")
        print("=" * 50)
        print(f"Wallet: {self.wallet_address}")
        print(f"Start Date: {self.start_date.date()}\n")
        
        try:
            self.setup_driver()
            self.scrape_wallet_page()
            self.calculate_stats()
            self.save_results()
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            if hasattr(self, 'driver'):
                self.driver.quit()
                print("\n✅ Browser closed")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 selenium-scrape-galascan.py <wallet-address> <start-date>")
        print('Example: python3 selenium-scrape-galascan.py "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-22"')
        sys.exit(1)
        
    wallet = sys.argv[1]
    start_date = sys.argv[2]
    
    scraper = GalaScanSeleniumScraper(wallet, start_date)
    scraper.run()