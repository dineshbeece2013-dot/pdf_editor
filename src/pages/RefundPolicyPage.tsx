import React from 'react';
import { LegalPage } from '../components/LegalPage';
import { REFUND_POLICY } from '../seo/content';

export const RefundPolicyPage: React.FC = () => (
  <LegalPage
    title="Refund Policy"
    intro="How refunds work for paid plans, and the cases in which we issue one."
    sections={REFUND_POLICY}
  />
);
