#!/usr/bin/env node

/**
 * Debug script to check pagination elements on GalaScan
 */

import puppeteer from 'puppeteer';

async function debugPagination(walletAddress) {
  console.log('🔍 Debugging GalaScan Pagination...');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser to see what's happening
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    const url = `https://galascan.gala.com/wallet/${walletAddress.replace('|', '%7C')}`;
    console.log(`Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for table
    await page.waitForSelector('tbody tr', { timeout: 5000 });
    
    // Count initial rows
    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll('tbody tr').length;
    });
    console.log(`Initial transaction rows: ${initialCount}`);
    
    // Check for pagination elements
    const paginationInfo = await page.evaluate(() => {
      const info = {
        hasSelect: false,
        selectText: '',
        hasPagination: false,
        paginationText: '',
        buttons: [],
        totalText: ''
      };
      
      // Look for items per page selector
      const selects = document.querySelectorAll('select');
      selects.forEach(select => {
        if (select.textContent.includes('10') || select.textContent.includes('per page')) {
          info.hasSelect = true;
          info.selectText = select.outerHTML.substring(0, 200);
        }
      });
      
      // Look for pagination text (e.g., "Showing 10 out of 111")
      const allText = document.body.innerText;
      const showingMatch = allText.match(/Showing\s+(\d+)\s+out of\s+(\d+)/i);
      if (showingMatch) {
        info.totalText = showingMatch[0];
      }
      
      // Look for pagination components
      const paginationSelectors = [
        '.MuiTablePagination-root',
        '.MuiPagination-root',
        '.pagination',
        '[role="navigation"]',
        '.ant-pagination'
      ];
      
      for (const selector of paginationSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          info.hasPagination = true;
          info.paginationText = element.textContent.substring(0, 100);
          break;
        }
      }
      
      // Find all buttons
      const buttons = Array.from(document.querySelectorAll('button'));
      info.buttons = buttons.map(btn => btn.textContent.trim()).filter(text => 
        text && (
          text.includes('Next') || 
          text.includes('Previous') || 
          text.includes('More') ||
          text.match(/^\d+$/) // Page numbers
        )
      );
      
      return info;
    });
    
    console.log('\n📋 Pagination Debug Info:');
    console.log('Has select dropdown:', paginationInfo.hasSelect);
    console.log('Has pagination component:', paginationInfo.hasPagination);
    console.log('Total text:', paginationInfo.totalText);
    console.log('Buttons found:', paginationInfo.buttons);
    
    // Try to change items per page if select exists
    if (paginationInfo.hasSelect) {
      console.log('\n🔄 Trying to change items per page...');
      const changed = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
          const options = Array.from(select.options);
          const largerOption = options.find(opt => 
            parseInt(opt.value) > 10 || opt.text.includes('50') || opt.text.includes('100')
          );
          if (largerOption) {
            select.value = largerOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      });
      
      if (changed) {
        console.log('Changed items per page, waiting...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const newCount = await page.evaluate(() => {
          return document.querySelectorAll('tbody tr').length;
        });
        console.log(`New transaction rows: ${newCount}`);
      }
    }
    
    // Check if scrolling loads more
    console.log('\n📜 Testing scroll loading...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);
    
    const afterScrollCount = await page.evaluate(() => {
      return document.querySelectorAll('tbody tr').length;
    });
    console.log(`After scroll: ${afterScrollCount} rows`);
    
    // Take screenshot
    await page.screenshot({ path: 'galascan-pagination-debug.png', fullPage: true });
    console.log('\n📸 Screenshot saved to galascan-pagination-debug.png');
    
    console.log('\n⏸️ Browser will stay open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

const wallet = process.argv[2] || "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5";
debugPagination(wallet);