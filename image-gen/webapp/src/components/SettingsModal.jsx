import React, { useState } from 'react'
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  TextField,
  Slider,
  Typography,
  Box,
  IconButton
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

const SettingsModal = ({ open, onClose, settings, onSave }) => {
  const [formData, setFormData] = useState(settings)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSliderChange = (name) => (e, newValue) => {
    setFormData(prev => ({ ...prev, [name]: newValue }))
  }

  const handleSave = () => {
    onSave(formData)
    onClose()
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ m: 0, p: 2 }}>
        Settings
        <IconButton
          aria-label="close"
          onClick={onClose}
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
        <TextField
          fullWidth
          label="API Base URL"
          name="apiBaseUrl"
          value={formData.apiBaseUrl || "http://localhost:8088/gateway"}
          onChange={handleChange}
          margin="normal"
          helperText="Default: http://localhost:8088/gateway"
        />
        
        <Box sx={{ mt: 3 }}>
          <Typography gutterBottom>
            API Timeout (seconds): {formData.timeout}
          </Typography>
          <Slider
            value={formData.timeout}
            onChange={handleSliderChange('timeout')}
            min={1}
            max={60}
            step={1}
            valueLabelDisplay="auto"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  )
}

export default SettingsModal
