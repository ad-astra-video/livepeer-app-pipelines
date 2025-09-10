import React from 'react'
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Typography, 
  Box, 
  Divider,
  IconButton,
  Grid
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

const MetadataOverlay = ({ open, onClose, image, formattedDate }) => {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Could add a snackbar notification here
        console.log('Copied to clipboard')
      })
      .catch(err => {
        console.error('Failed to copy: ', err)
      })
  }

  const handleClose = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    onClose();
  };

  const MetadataItem = ({ label, value, copyable = false }) => (
    <Box sx={{ mb: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography 
          variant="body2" 
          sx={{ 
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap'
          }}
        >
          {value}
        </Typography>
        {copyable && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(value);
            }}
            sx={{ ml: 0.5 }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  )

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      onClick={(e) => e.stopPropagation()} // Prevent event from reaching the card
    >
      <DialogTitle sx={{ m: 0, p: 2 }}>
        Image Details
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ p: 2 }}>
          <MetadataItem 
            label="Prompt" 
            value={image.prompt} 
            copyable
          />
          
          {image.negative_prompt && (
            <MetadataItem 
              label="Negative Prompt" 
              value={image.negative_prompt} 
              copyable
            />
          )}
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1 }}>
            <MetadataItem 
              label="Steps" 
              value={image.num_inference_steps} 
            />
            <MetadataItem 
              label="CFG Scale" 
              value={image.guidance_scale} 
            />
            <MetadataItem 
              label="Seed" 
              value={image.seed} 
              copyable
            />
          </Box>
          
          <MetadataItem 
            label="Generated" 
            value={formattedDate} 
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default MetadataOverlay
