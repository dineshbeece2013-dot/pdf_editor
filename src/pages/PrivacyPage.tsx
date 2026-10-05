import React from 'react';
import { LegalPage } from '../components/LegalPage';
import { PRIVACY_POLICY } from '../seo/content';

export const PrivacyPage: React.FC = () => (
  <LegalPage
    title="Privacy Policy"
    intro="This policy explains what information PDF Editor Pro collects, why we collect it, and what control you have over it."
    sections={PRIVACY_POLICY}
  />
);
