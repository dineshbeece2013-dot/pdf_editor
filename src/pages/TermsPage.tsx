import React from 'react';
import { LegalPage } from '../components/LegalPage';
import { TERMS_OF_SERVICE } from '../seo/content';

export const TermsPage: React.FC = () => (
  <LegalPage
    title="Terms of Service"
    intro="These terms set out the rules for using PDF Editor Pro. By using the service you agree to them."
    sections={TERMS_OF_SERVICE}
  />
);
